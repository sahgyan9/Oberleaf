import React, { useId } from 'react';

interface PdfDocumentIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Custom PDF Document Icon matching the Scholarly Atelier brand guidelines.
 * Features an offset document outline and front card with a transparent "PDF" cutout
 * that dynamically lets background and hover colors show through in both light and dark modes.
 */
export const PdfDocumentIcon: React.FC<PdfDocumentIconProps> = ({
  className = 'w-3.5 h-3.5',
  ...props
}) => {
  const rawId = useId();
  const maskId = `pdf-doc-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      viewBox="38 22 110 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <mask id={maskId}>
          {/* Base mask: white allows the currentColor fill through */}
          <rect x="0" y="0" width="200" height="200" fill="white" />
          {/* Transparent cutout: black carves out the "PDF" lettering */}
          <text
            x="102"
            y="78"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
            fontSize="30"
            fontWeight="900"
            letterSpacing="-0.5"
            fill="black"
          >
            PDF
          </text>
        </mask>
      </defs>

      {/* Back document / offset outline */}
      <path
        d="M49 51V113C49 117.4 52.6 121 57 121H119"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Front document with dynamic background cutout */}
      <rect
        x="62"
        y="28"
        width="80"
        height="78"
        rx="11"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
};

export default PdfDocumentIcon;
