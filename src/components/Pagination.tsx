interface Props {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}

/** Simple prev / "page X of Y" / next control. Renders nothing for a single page. */
export function Pagination({ page, pageCount, onPage }: Props) {
  if (pageCount <= 1) return null;

  return (
    <div className="pagination">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Page précédente"
      >
        ‹
      </button>
      <span>
        Page {page} / {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount}
        aria-label="Page suivante"
      >
        ›
      </button>
    </div>
  );
}

/** Items per page shared across paginated lists. */
export const PAGE_SIZE = 20;
