import { notFound } from "next/navigation";

/**
 * The component gallery is a development tool: 404 in production builds unless the deployment
 * explicitly opts in with DEV_GALLERY=1 (e.g. a staging review environment). Not linked anywhere.
 */
export function assertGalleryEnabled(): void {
  if (process.env.NODE_ENV === "production" && process.env.DEV_GALLERY !== "1") notFound();
}
