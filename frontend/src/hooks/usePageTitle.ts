import { useEffect } from "react";

const BASE_TITLE = "Museum Connections";

/**
 * Sets the document title for the current page.
 * Appends the base title: "Page Name | Museum Connections"
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
