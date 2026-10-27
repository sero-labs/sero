import type { ToolProbe } from '../types';
import { designLibraryAnalysisProbe } from './design-library-analysis';
import { designLibraryAssetsProbe } from './design-library-assets';
import { designLibraryDesignsProbe } from './design-library-designs';
import { designLibraryExportProbe } from './design-library-export';
import { designLibraryGalleryProbe } from './design-library-gallery';
import { designLibraryItemsProbe } from './design-library-items';
import { designLibraryMediaProbe } from './design-library-media';
import { designLibrarySettingsProbe } from './design-library-settings';

/** Earlier tools make what later ones read: imports, then analysis, then Designs and what they save. */
export const designLibraryProbes: ToolProbe[] = [
  designLibraryAssetsProbe,
  designLibraryItemsProbe,
  designLibraryAnalysisProbe,
  designLibraryDesignsProbe,
  designLibraryGalleryProbe,
  designLibraryExportProbe,
  designLibraryMediaProbe,
  designLibrarySettingsProbe,
];
