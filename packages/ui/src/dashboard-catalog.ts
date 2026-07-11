// Stable subpath for the dashboard component catalogue metadata.
//
//   import { dashboardComponentCatalog } from "@sero-ai/ui/dashboard-catalog";
//
// The metadata is for discovery tools, documentation and agent workflows; it is
// not involved in rendering. Normal widget code imports React components from
// the package root instead.

export {
  dashboardComponentCatalog,
  type DashboardComponentCatalogEntry,
} from "./components/dashboard/catalog";
export { default } from "./components/dashboard/catalog";
