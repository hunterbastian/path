import { Player } from '@remotion/player';
import type { AnyZodObject } from 'remotion';
import {
  defaultPathAlphaPreviewProps,
  PATH_ALPHA_PREVIEW_DURATION_IN_FRAMES,
  PATH_ALPHA_PREVIEW_FPS,
  PATH_ALPHA_PREVIEW_HEIGHT,
  PATH_ALPHA_PREVIEW_WIDTH,
  type PathAlphaPreviewProps,
  PathAlphaPreview,
} from './PathAlphaPreview';

export const TitleAlphaPreviewEmbed = () => {
  return (
    <Player<AnyZodObject, PathAlphaPreviewProps>
      acknowledgeRemotionLicense
      allowFullscreen={false}
      autoPlay
      clickToPlay={false}
      component={PathAlphaPreview}
      compositionHeight={PATH_ALPHA_PREVIEW_HEIGHT}
      compositionWidth={PATH_ALPHA_PREVIEW_WIDTH}
      controls={false}
      doubleClickToFullscreen={false}
      durationInFrames={PATH_ALPHA_PREVIEW_DURATION_IN_FRAMES}
      fps={PATH_ALPHA_PREVIEW_FPS}
      initiallyMuted
      inputProps={defaultPathAlphaPreviewProps}
      loop
      renderLoading={() => (
        <div
          style={{
            display: 'grid',
            height: '100%',
            width: '100%',
            placeItems: 'center',
            background:
              'radial-gradient(circle at 32% 18%, rgba(241, 199, 117, 0.16), transparent 28%), linear-gradient(180deg, rgba(35, 27, 20, 0.98), rgba(11, 9, 7, 1))',
            color: '#efe5d3',
            fontFamily: '"Geist Mono", "SFMono-Regular", monospace',
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          Loading alpha reel
        </div>
      )}
      showVolumeControls={false}
      spaceKeyToPlayOrPause={false}
      style={{
        width: '100%',
        aspectRatio: `${PATH_ALPHA_PREVIEW_WIDTH} / ${PATH_ALPHA_PREVIEW_HEIGHT}`,
      }}
    />
  );
};
