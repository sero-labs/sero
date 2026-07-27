/**
 * Design Library Pi extension.
 *
 * Registers the grouped, read-and-intent tool surface. Nothing here writes a
 * domain record: writes are appended as requests and applied by the plugin's
 * background runtime, which is the single authoritative writer.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { createAssetsTool } from './tools/assets';
import { createAnalysisTool, createItemsTool } from './tools/items';
import { createDesignsTool } from './tools/designs';
import { createDesignAssetsTool, createExportTool, createGalleryTool } from './tools/gallery';
import { createSettingsTool } from './tools/settings';

export default function (pi: ExtensionAPI) {
  pi.registerTool(createAssetsTool());
  pi.registerTool(createItemsTool());
  pi.registerTool(createAnalysisTool());
  pi.registerTool(createDesignsTool());
  pi.registerTool(createDesignAssetsTool());
  pi.registerTool(createGalleryTool());
  pi.registerTool(createExportTool());
  pi.registerTool(createSettingsTool());
}
