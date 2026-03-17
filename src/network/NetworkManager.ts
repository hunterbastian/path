/**
 * NetworkManager — SpacetimeDB connection, position broadcasting, and remote
 * player state tracking for multiplayer ghost rendering.
 *
 * Design:
 * - Connects via WebSocket to a SpacetimeDB module
 * - Subscribes to the `player` table (online players only)
 * - Broadcasts local vehicle position at 5Hz via `update_position` reducer
 * - Maintains interpolation state for each remote player so the ghost system
 *   can render smooth 60fps movement from 5Hz network updates
 */

import { DbConnection } from './bindings';

const SEND_INTERVAL = 0.2; // 5Hz position broadcast

/** Matches the auto-generated Player row shape from SpacetimeDB bindings. */
interface PlayerRow {
  identity: { toHexString(): string };
  name: string;
  posX: number;
  posY: number;
  posZ: number;
  heading: number;
  speed: number;
  isBoosting: boolean;
  isDrifting: boolean;
  online: boolean;
}
const TOKEN_KEY = 'path-mp-token';

export interface RemotePlayerState {
  identity: string;
  name: string;
  // Current (latest from server)
  posX: number;
  posY: number;
  posZ: number;
  heading: number;
  speed: number;
  isBoosting: boolean;
  isDrifting: boolean;
  // Previous (for interpolation)
  prevPosX: number;
  prevPosY: number;
  prevPosZ: number;
  prevHeading: number;
  // Interpolation factor 0→1 between prev and current
  interpT: number;
}

export class NetworkManager {
  #connection: DbConnection | null = null;
  #localIdentity: string | null = null;
  readonly #remotePlayers = new Map<string, RemotePlayerState>();
  #sendAccumulator = 0;
  #connected = false;

  /**
   * Connect to a SpacetimeDB module. Non-blocking — the game works offline
   * and ghosts appear when the connection establishes.
   */
  async connect(host: string, moduleName: string): Promise<void> {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY) ?? undefined;

      const conn = DbConnection.builder()
        .withUri(host)
        .withDatabaseName(moduleName)
        .withToken(savedToken)
        .onConnect((_conn: DbConnection, identity: { toHexString(): string }, token: string) => {
          this.#localIdentity = identity.toHexString();
          this.#connected = true;
          if (token) {
            localStorage.setItem(TOKEN_KEY, token);
          }
          console.log(`[Network] Connected as ${this.#localIdentity}`);

          // Subscribe to online players
          conn.subscriptionBuilder()
            .onApplied(this.#onSubscriptionApplied.bind(this))
            .subscribe('SELECT * FROM player WHERE online = true');
        })
        .onConnectError((_ctx: unknown, err: Error) => {
          console.log(`[Network] Connection failed: ${err.message} — single-player mode`);
          this.#connected = false;
        })
        .onDisconnect(() => {
          console.log('[Network] Disconnected');
          this.#connected = false;
          this.#remotePlayers.clear();
        })
        .build();

      this.#connection = conn;

      // Register table callbacks for real-time updates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (conn.db.player as any).onInsert((_ctx: unknown, row: PlayerRow) => {
        this.#handlePlayerUpdate(row);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (conn.db.player as any).onUpdate((_ctx: unknown, _old: PlayerRow, row: PlayerRow) => {
        if (row.online) {
          this.#handlePlayerUpdate(row);
        } else {
          this.onRemotePlayerRemove(row.identity.toHexString());
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (conn.db.player as any).onDelete((_ctx: unknown, row: PlayerRow) => {
        this.onRemotePlayerRemove(row.identity.toHexString());
      });
    } catch {
      console.log('[Network] No server available — single-player mode');
      this.#connected = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #onSubscriptionApplied(ctx: any): void {
    // Load all currently online players from the initial subscription
    for (const row of ctx.db.player.iter()) {
      if ((row as PlayerRow).online) {
        this.#handlePlayerUpdate(row as PlayerRow);
      }
    }
    console.log(`[Network] Subscription applied — ${this.#remotePlayers.size} other players online`);
  }

  #handlePlayerUpdate(row: { identity: { toHexString(): string }; name: string; posX: number; posY: number; posZ: number; heading: number; speed: number; isBoosting: boolean; isDrifting: boolean }): void {
    const identity = row.identity.toHexString();
    this.onRemotePlayerUpdate(
      identity,
      row.name,
      row.posX,
      row.posY,
      row.posZ,
      row.heading,
      row.speed,
      row.isBoosting,
      row.isDrifting,
    );
  }

  /**
   * Called every physics step. Accumulates time and broadcasts position
   * at 5Hz when connected. Advances interpolation on all remote players.
   */
  update(
    dt: number,
    posX: number,
    posY: number,
    posZ: number,
    heading: number,
    speed: number,
    isBoosting: boolean,
    isDrifting: boolean,
  ): void {
    // Advance interpolation for all remote players
    for (const remote of this.#remotePlayers.values()) {
      remote.interpT = Math.min(1, remote.interpT + dt / SEND_INTERVAL);
    }

    if (!this.#connected || !this.#connection) return;

    // Accumulate and broadcast at 5Hz
    this.#sendAccumulator += dt;
    if (this.#sendAccumulator >= SEND_INTERVAL) {
      this.#sendAccumulator = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.#connection.reducers as any).updatePosition(
        posX, posY, posZ, heading, speed, isBoosting, isDrifting,
      );
    }
  }

  /**
   * Updates interpolation state for a remote player. Called from subscription
   * callbacks when a player row is inserted or updated.
   */
  onRemotePlayerUpdate(
    identity: string,
    name: string,
    posX: number,
    posY: number,
    posZ: number,
    heading: number,
    speed: number,
    isBoosting: boolean,
    isDrifting: boolean,
  ): void {
    // Skip our own identity
    if (identity === this.#localIdentity) return;

    const existing = this.#remotePlayers.get(identity);
    if (existing) {
      // Shift current → prev for interpolation
      existing.prevPosX = existing.posX;
      existing.prevPosY = existing.posY;
      existing.prevPosZ = existing.posZ;
      existing.prevHeading = existing.heading;
      // Set new current
      existing.posX = posX;
      existing.posY = posY;
      existing.posZ = posZ;
      existing.heading = heading;
      existing.speed = speed;
      existing.isBoosting = isBoosting;
      existing.isDrifting = isDrifting;
      existing.name = name;
      // Reset interpolation
      existing.interpT = 0;
    } else {
      this.#remotePlayers.set(identity, {
        identity,
        name,
        posX,
        posY,
        posZ,
        heading,
        speed,
        isBoosting,
        isDrifting,
        prevPosX: posX,
        prevPosY: posY,
        prevPosZ: posZ,
        prevHeading: heading,
        interpT: 1, // Start fully at current position (no lerp on first appearance)
      });
    }
  }

  /** Called when a remote player disconnects. */
  onRemotePlayerRemove(identity: string): void {
    this.#remotePlayers.delete(identity);
  }

  /** Returns iterator of all remote players for ghost rendering. */
  getRemotePlayers(): IterableIterator<RemotePlayerState> {
    return this.#remotePlayers.values();
  }

  get remotePlayerCount(): number {
    return this.#remotePlayers.size;
  }

  get playerCount(): number {
    return this.#remotePlayers.size + (this.#connected ? 1 : 0);
  }

  get isConnected(): boolean {
    return this.#connected;
  }

  /** Send the player's display name to the server. */
  setName(name: string): void {
    if (!this.#connected || !this.#connection) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.#connection.reducers as any).setName(name);
  }

  disconnect(): void {
    this.#connection?.disconnect();
    this.#connection = null;
    this.#connected = false;
    this.#remotePlayers.clear();
  }
}
