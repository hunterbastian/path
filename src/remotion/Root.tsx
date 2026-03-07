import { Composition, type AnyZodObject } from 'remotion';
import {
  defaultPathAlphaPreviewProps,
  PATH_ALPHA_PREVIEW_DURATION_IN_FRAMES,
  PATH_ALPHA_PREVIEW_FPS,
  PATH_ALPHA_PREVIEW_HEIGHT,
  PATH_ALPHA_PREVIEW_WIDTH,
  type PathAlphaPreviewProps,
  PathAlphaPreview,
} from './PathAlphaPreview';

export const RemotionRoot = () => {
  return (
    <Composition<AnyZodObject, PathAlphaPreviewProps>
      id="PathAlphaPreview"
      component={PathAlphaPreview}
      durationInFrames={PATH_ALPHA_PREVIEW_DURATION_IN_FRAMES}
      fps={PATH_ALPHA_PREVIEW_FPS}
      width={PATH_ALPHA_PREVIEW_WIDTH}
      height={PATH_ALPHA_PREVIEW_HEIGHT}
      defaultProps={defaultPathAlphaPreviewProps}
    />
  );
};
