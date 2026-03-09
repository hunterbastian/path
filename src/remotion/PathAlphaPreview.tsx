import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export interface PathAlphaPreviewMetric {
  label: string;
  value: string;
  accent: string;
}

export interface PathAlphaPreviewChapter {
  stamp: string;
  title: string;
  detail: string;
}

export interface PathAlphaPreviewProps extends Record<string, unknown> {
  edition: string;
  strapline: string;
  logline: string;
  surfaces: string[];
  metrics: PathAlphaPreviewMetric[];
  chapters: PathAlphaPreviewChapter[];
}

export const PATH_ALPHA_PREVIEW_WIDTH = 1280;
export const PATH_ALPHA_PREVIEW_HEIGHT = 720;
export const PATH_ALPHA_PREVIEW_FPS = 30;
export const PATH_ALPHA_PREVIEW_DURATION_IN_FRAMES = 240;

const ROUTE_POINTS = [
  { x: 86, y: 286 },
  { x: 182, y: 246 },
  { x: 306, y: 168 },
  { x: 436, y: 82 },
] as const;

const ROUTE_PATH =
  'M86 286 C128 274 156 256 182 246 C228 220 262 198 306 168 C354 132 395 104 436 82';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const defaultPathAlphaPreviewProps: PathAlphaPreviewProps = {
  edition: 'Early alpha preview',
  strapline: 'Seeded alpine driving prototype',
  logline:
    'Rain rolls over the basin, the route wakes up, and the summit relay is still the only light left on the mountain.',
  surfaces: ['snow seams', 'basin dirt', 'soft sand', 'meltwater'],
  metrics: [
    {
      label: 'objective',
      value: 'reactivate the summit relay',
      accent: '#f1c775',
    },
    {
      label: 'weather',
      value: 'wet-season fronts shifting in real time',
      accent: '#8fa6b2',
    },
    {
      label: 'terrain',
      value: 'snow, dirt, sand, and water on one route',
      accent: '#86a17a',
    },
  ],
  chapters: [
    {
      stamp: '00:00',
      title: 'Trailhead ignition',
      detail: 'Cold start at basin camp with the route still sleeping.',
    },
    {
      stamp: '00:03',
      title: 'Crosswinds + melt seams',
      detail: 'Grip shifts as the weather pushes water across the line.',
    },
    {
      stamp: '00:06',
      title: 'Summit relay climb',
      detail: 'The last marked beacon stays hot above the ridge fog.',
    },
  ],
};

export const PathAlphaPreview = ({
  edition,
  strapline,
  logline,
  surfaces,
  metrics,
  chapters,
}: PathAlphaPreviewProps) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fade = interpolate(
    frame,
    [0, 10, durationInFrames - 20, durationInFrames - 1],
    [0, 1, 1, 0],
    {
      easing: Easing.bezier(0.33, 1, 0.68, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
  const copyReveal = spring({
    fps,
    frame: frame - 4,
    config: {
      damping: 18,
      stiffness: 120,
      mass: 0.85,
    },
  });
  const routeReveal = spring({
    fps,
    frame: frame - 18,
    config: {
      damping: 17,
      stiffness: 115,
      mass: 0.9,
    },
  });
  const footerReveal = spring({
    fps,
    frame: frame - 40,
    config: {
      damping: 16,
      stiffness: 108,
      mass: 0.85,
    },
  });
  const topoShiftX = interpolate(frame, [0, durationInFrames], [0, -64], {
    easing: Easing.linear,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const topoShiftY = interpolate(frame, [0, durationInFrames], [0, 48], {
    easing: Easing.linear,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const routeProgress = clamp(
    interpolate(frame, [28, 160], [0, 1], {
      easing: Easing.bezier(0.21, 0.98, 0.34, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
    0,
    1,
  );
  const mappedPercent = Math.round(
    interpolate(frame, [0, durationInFrames], [18, 87], {
      easing: Easing.linear,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const windSpeed = Math.round(
    interpolate(frame, [0, durationInFrames], [14, 43], {
      easing: Easing.linear,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const waterLevel = interpolate(frame, [0, durationInFrames], [0.3, 1.4], {
    easing: Easing.linear,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scanLineY = interpolate(frame, [0, durationInFrames], [-220, 420], {
    easing: Easing.linear,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: fade,
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 18% 14%, rgba(241, 199, 117, 0.18), transparent 28%), radial-gradient(circle at 78% 20%, rgba(137, 168, 182, 0.18), transparent 26%), linear-gradient(180deg, #2d2118 0%, #16110d 50%, #090705 100%)',
        color: '#f4ecde',
        fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -120,
          opacity: 0.36,
          backgroundImage:
            'repeating-linear-gradient(116deg, rgba(236, 223, 194, 0.08) 0 1px, transparent 1px 16px), repeating-linear-gradient(16deg, rgba(116, 139, 128, 0.06) 0 1px, transparent 1px 26px)',
          transform: `translate3d(${topoShiftX}px, ${topoShiftY}px, 0)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '42% -6% 0',
          background:
            'linear-gradient(180deg, rgba(42, 34, 26, 0) 0%, rgba(25, 20, 16, 0.28) 18%, rgba(15, 12, 10, 0.92) 100%)',
          clipPath: 'polygon(0% 40%, 12% 28%, 24% 34%, 38% 22%, 52% 28%, 70% 16%, 84% 23%, 100% 10%, 100% 100%, 0% 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '51% -8% -8%',
          opacity: 0.92,
          background:
            'linear-gradient(180deg, rgba(58, 50, 36, 0) 0%, rgba(74, 63, 44, 0.32) 24%, rgba(24, 18, 13, 0.96) 100%)',
          clipPath: 'polygon(0% 28%, 14% 42%, 26% 30%, 40% 48%, 57% 28%, 71% 38%, 86% 20%, 100% 33%, 100% 100%, 0% 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(6, 6, 6, 0) 0%, rgba(6, 6, 6, 0.08) 58%, rgba(6, 6, 6, 0.34) 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: '48px 52px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
          gap: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transform: `translateY(${(1 - copyReveal) * 28}px)`,
            opacity: copyReveal,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                fontSize: 16,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(238, 229, 205, 0.74)',
              }}
            >
              <span
                style={{
                  padding: '9px 12px 8px',
                  border: '1px solid rgba(241, 199, 117, 0.24)',
                  background: 'rgba(241, 199, 117, 0.08)',
                }}
              >
                {edition}
              </span>
              <span>Wet season seed 01</span>
            </div>

            <div
              style={{
                marginTop: 26,
                fontSize: 136,
                lineHeight: 0.88,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#f6efe2',
                textShadow: '0 18px 40px rgba(0, 0, 0, 0.26)',
              }}
            >
              Path
            </div>

            <div
              style={{
                maxWidth: 520,
                marginTop: 18,
                fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                fontSize: 18,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(205, 196, 171, 0.78)',
              }}
            >
              {strapline}
            </div>

            <p
              style={{
                maxWidth: 560,
                margin: '22px 0 0',
                fontSize: 29,
                lineHeight: 1.36,
                color: 'rgba(244, 237, 224, 0.94)',
                textWrap: 'balance',
              }}
            >
              {logline}
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginTop: 28,
              }}
            >
              {surfaces.map((surface, index) => {
                const chipReveal = spring({
                  fps,
                  frame: frame - (20 + index * 4),
                  config: {
                    damping: 17,
                    stiffness: 118,
                    mass: 0.9,
                  },
                });

                return (
                  <div
                    key={surface}
                    style={{
                      transform: `translateY(${(1 - chipReveal) * 16}px)`,
                      opacity: chipReveal,
                      padding: '10px 12px 9px',
                      border: '1px solid rgba(233, 221, 196, 0.12)',
                      background:
                        'linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(18, 15, 11, 0.34)), rgba(19, 15, 11, 0.42)',
                      fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                      fontSize: 15,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'rgba(238, 229, 205, 0.82)',
                    }}
                  >
                    {surface}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 12,
              marginBottom: 34,
            }}
          >
            {metrics.map((metric, index) => {
              const cardReveal = spring({
                fps,
                frame: frame - (34 + index * 10),
                config: {
                  damping: 18,
                  stiffness: 110,
                  mass: 0.95,
                },
              });

              return (
                <div
                  key={metric.label}
                  style={{
                    transform: `translateY(${(1 - cardReveal) * 22}px)`,
                    opacity: cardReveal,
                    minHeight: 136,
                    padding: '18px 18px 16px',
                    border: `1px solid ${metric.accent}33`,
                    background:
                      'linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.01)), rgba(15, 11, 9, 0.46)',
                    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.16)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                      fontSize: 14,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: `${metric.accent}`,
                    }}
                  >
                    {metric.label}
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 23,
                      lineHeight: 1.26,
                      color: 'rgba(245, 238, 223, 0.94)',
                      textWrap: 'balance',
                    }}
                  >
                    {metric.value}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            transform: `translateY(${(1 - routeReveal) * 30}px) scale(${0.98 + routeReveal * 0.02})`,
            opacity: routeReveal,
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
              overflow: 'hidden',
              border: '1px solid rgba(233, 221, 196, 0.14)',
              background:
                'linear-gradient(180deg, rgba(26, 21, 15, 0.86), rgba(10, 8, 6, 0.94)), radial-gradient(circle at 50% 0%, rgba(241, 199, 117, 0.12), transparent 45%)',
              boxShadow: '0 30px 70px rgba(0, 0, 0, 0.28)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 20px 16px',
                borderBottom: '1px solid rgba(233, 221, 196, 0.08)',
                fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                fontSize: 14,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(222, 212, 188, 0.72)',
              }}
            >
              <span>Route scan</span>
              <span>Loop 00:08</span>
            </div>

            <div
              style={{
                position: 'relative',
                margin: 20,
                height: 330,
                border: '1px solid rgba(233, 221, 196, 0.08)',
                background:
                  'radial-gradient(circle at 35% 28%, rgba(241, 199, 117, 0.08), transparent 28%), linear-gradient(180deg, rgba(26, 22, 17, 0.7), rgba(11, 9, 7, 0.96))',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage:
                    'repeating-linear-gradient(90deg, rgba(233, 221, 196, 0.03) 0 1px, transparent 1px 48px), repeating-linear-gradient(0deg, rgba(233, 221, 196, 0.03) 0 1px, transparent 1px 48px)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: scanLineY,
                  height: 90,
                  background:
                    'linear-gradient(180deg, rgba(241, 199, 117, 0), rgba(241, 199, 117, 0.12), rgba(241, 199, 117, 0))',
                  opacity: 0.85,
                }}
              />
              <svg
                viewBox="0 0 520 340"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                }}
              >
                <path
                  d={ROUTE_PATH}
                  fill="none"
                  stroke="rgba(233, 221, 196, 0.16)"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
                <path
                  d={ROUTE_PATH}
                  fill="none"
                  stroke="#f1c775"
                  strokeWidth={6}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - routeProgress}
                />
                {ROUTE_POINTS.map((point, index) => {
                  const pulse = 0.7 + Math.sin((frame + index * 8) / 8) * 0.18;
                  const active = routeProgress >= index / (ROUTE_POINTS.length - 1);

                  return (
                    <g key={`${point.x}-${point.y}`}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={16 * pulse}
                        fill={active ? 'rgba(241, 199, 117, 0.16)' : 'rgba(233, 221, 196, 0.06)'}
                      />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={active ? 7 : 5}
                        fill={active ? '#f6efe2' : 'rgba(233, 221, 196, 0.35)'}
                      />
                    </g>
                  );
                })}
              </svg>

              <div
                style={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  bottom: 16,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: '12px 12px 10px',
                    border: '1px solid rgba(233, 221, 196, 0.08)',
                    background: 'rgba(12, 10, 8, 0.52)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                      fontSize: 13,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'rgba(212, 202, 178, 0.62)',
                    }}
                  >
                    mapped
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 28,
                    }}
                  >
                    {mappedPercent}%
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 12px 10px',
                    border: '1px solid rgba(233, 221, 196, 0.08)',
                    background: 'rgba(12, 10, 8, 0.52)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                      fontSize: 13,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'rgba(212, 202, 178, 0.62)',
                    }}
                  >
                    wind
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 28,
                    }}
                  >
                    {windSpeed}k
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 12px 10px',
                    border: '1px solid rgba(233, 221, 196, 0.08)',
                    background: 'rgba(12, 10, 8, 0.52)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                      fontSize: 13,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'rgba(212, 202, 178, 0.62)',
                    }}
                  >
                    water
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 28,
                    }}
                  >
                    {waterLevel.toFixed(1)}m
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 10,
                padding: '0 20px 20px',
              }}
            >
              {chapters.map((chapter, index) => {
                const chapterReveal = spring({
                  fps,
                  frame: frame - (58 + index * 8),
                  config: {
                    damping: 18,
                    stiffness: 112,
                    mass: 0.9,
                  },
                });

                return (
                  <div
                    key={chapter.title}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '82px minmax(0, 1fr)',
                      gap: 12,
                      alignItems: 'start',
                      transform: `translateX(${(1 - chapterReveal) * 24}px)`,
                      opacity: chapterReveal,
                      padding: '14px 14px 12px',
                      border: '1px solid rgba(233, 221, 196, 0.08)',
                      background:
                        'linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01)), rgba(15, 11, 9, 0.44)',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
                        fontSize: 14,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: 'rgba(241, 199, 117, 0.78)',
                      }}
                    >
                      {chapter.stamp}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          lineHeight: 1.18,
                          color: '#f6efe2',
                        }}
                      >
                        {chapter.title}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 16,
                          lineHeight: 1.42,
                          color: 'rgba(224, 214, 190, 0.72)',
                        }}
                      >
                        {chapter.detail}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 52,
          right: 52,
          bottom: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 18,
          transform: `translateY(${(1 - footerReveal) * 20}px)`,
          opacity: footerReveal,
          padding: '14px 18px 13px',
          border: '1px solid rgba(233, 221, 196, 0.12)',
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(15, 11, 9, 0.22)), rgba(15, 11, 9, 0.5)',
          fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
          fontSize: 14,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'rgba(226, 216, 193, 0.82)',
        }}
      >
        <span>Playable build online now</span>
        <span>Weather shifts</span>
        <span>Relay splits</span>
        <span>Summit climb</span>
      </div>
    </AbsoluteFill>
  );
};
