use spacetimedb::{table, reducer, Table, Identity, Timestamp, ReducerContext};

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/// Every connected player's live state — position, heading, speed, visual flags.
/// Clients subscribe to `SELECT * FROM player WHERE online = true` and render
/// ghost vehicles for each remote row.
#[table(name = player, public)]
pub struct Player {
    #[primary_key]
    identity: Identity,
    name: String,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    heading: f32,
    speed: f32,
    is_boosting: bool,
    is_drifting: bool,
    online: bool,
    last_update: Timestamp,
}

/// Singleton row (id = 0) holding server-authoritative world state.
/// Weather elapsed time drives the weather cycle; day_time drives sky moods.
#[table(name = world_state, public)]
pub struct WorldState {
    #[primary_key]
    id: u32,
    weather_elapsed_s: f64,
    day_time: f64,
}

/// Global chat messages. Auto-incremented ID, newest messages at highest ID.
/// Clients subscribe and render the last ~50 messages.
#[table(name = chat_message, public)]
pub struct ChatMessage {
    #[auto_inc]
    #[primary_key]
    id: u64,
    sender_identity: Identity,
    sender_name: String,
    text: String,
    sent_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Lifecycle reducers
// ---------------------------------------------------------------------------

/// Called when the module is first published. Seeds the world state.
#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    ctx.db.world_state().insert(WorldState {
        id: 0,
        weather_elapsed_s: 0.0,
        day_time: 0.35, // start at morning
    });
    log::info!("PATH multiplayer module initialized");
}

/// Called when a client connects. Creates or re-activates their player row.
#[reducer(client_connected)]
pub fn client_connected(ctx: &ReducerContext) {
    let identity = ctx.sender;
    if let Some(mut existing) = ctx.db.player().identity().find(identity) {
        existing.online = true;
        existing.last_update = ctx.timestamp;
        ctx.db.player().identity().update(existing);
        log::info!("Player reconnected: {:?}", identity);
    } else {
        ctx.db.player().insert(Player {
            identity,
            name: String::new(),
            pos_x: 0.0,
            pos_y: 4.0,
            pos_z: 0.0,
            heading: 0.0,
            speed: 0.0,
            is_boosting: false,
            is_drifting: false,
            online: true,
            last_update: ctx.timestamp,
        });
        log::info!("New player connected: {:?}", identity);
    }
}

/// Called when a client disconnects. Marks them offline so other clients
/// stop rendering their ghost.
#[reducer(client_disconnected)]
pub fn client_disconnected(ctx: &ReducerContext) {
    let identity = ctx.sender;
    if let Some(mut player) = ctx.db.player().identity().find(identity) {
        player.online = false;
        ctx.db.player().identity().update(player);
        log::info!("Player disconnected: {:?}", identity);
    }
}

// ---------------------------------------------------------------------------
// Game reducers
// ---------------------------------------------------------------------------

/// Called by each client at ~5Hz to broadcast their vehicle state.
#[reducer]
pub fn update_position(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    heading: f32,
    speed: f32,
    is_boosting: bool,
    is_drifting: bool,
) {
    let identity = ctx.sender;
    if let Some(mut player) = ctx.db.player().identity().find(identity) {
        player.pos_x = pos_x.clamp(-500.0, 500.0);
        player.pos_y = pos_y.clamp(-10.0, 200.0);
        player.pos_z = pos_z.clamp(-500.0, 500.0);
        player.heading = heading;
        player.speed = speed.clamp(0.0, 100.0);
        player.is_boosting = is_boosting;
        player.is_drifting = is_drifting;
        player.last_update = ctx.timestamp;
        ctx.db.player().identity().update(player);
    }
}

/// Set the player's display name.
#[reducer]
pub fn set_name(ctx: &ReducerContext, name: String) {
    let identity = ctx.sender;
    if let Some(mut player) = ctx.db.player().identity().find(identity) {
        player.name = name.chars().take(24).collect();
        ctx.db.player().identity().update(player);
    }
}

/// Send a global chat message. Text clamped to 200 chars.
#[reducer]
pub fn send_chat(ctx: &ReducerContext, text: String) {
    let identity = ctx.sender;
    let sender_name = ctx.db.player().identity().find(identity)
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "Anonymous".to_string());
    let trimmed: String = text.chars().take(200).collect();
    if trimmed.is_empty() {
        return;
    }
    ctx.db.chat_message().insert(ChatMessage {
        id: 0, // auto_inc
        sender_identity: identity,
        sender_name,
        text: trimmed,
        sent_at: ctx.timestamp,
    });
}

/// Update shared world state (weather + day/night). Called by the "host" client
/// (first connected player or lowest identity) at ~1Hz.
#[reducer]
pub fn sync_world_state(ctx: &ReducerContext, weather_elapsed_s: f64, day_time: f64) {
    if let Some(mut ws) = ctx.db.world_state().id().find(0) {
        ws.weather_elapsed_s = weather_elapsed_s;
        ws.day_time = day_time.clamp(0.0, 1.0);
        ctx.db.world_state().id().update(ws);
    }
}
