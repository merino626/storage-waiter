import type { ReactNode, SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function S({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Marca do app: rack de storage. */
export const IconLogo = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="4.5" width="17" height="6.5" rx="1.5" />
    <rect x="3.5" y="13" width="17" height="6.5" rx="1.5" />
    <path d="M7 7.75h.01M7 16.25h.01" strokeWidth="2.2" />
    <path d="M13.5 7.75H17M13.5 16.25H17" opacity="0.55" />
  </S>
);

export const IconUpload = (p: IconProps) => (
  <S {...p}>
    <path d="M21 15v3.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5V15" />
    <path d="m7 9 5-5 5 5M12 4v11" />
  </S>
);

export const IconDownload = (p: IconProps) => (
  <S {...p}>
    <path d="M21 15v3.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5V15" />
    <path d="m7 10 5 5 5-5M12 15V4" />
  </S>
);

export const IconFolder = (p: IconProps) => (
  <S {...p}>
    <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2a1 1 0 0 1 .7.3L11.5 7H19a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z" />
  </S>
);

export const IconFolderPlus = (p: IconProps) => (
  <S {...p}>
    <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2a1 1 0 0 1 .7.3L11.5 7H19a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z" />
    <path d="M12 10.5v5M9.5 13h5" />
  </S>
);

export const IconFile = (p: IconProps) => (
  <S {...p}>
    <path d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
    <path d="M13.5 3v5h5" />
  </S>
);

export const IconFileText = (p: IconProps) => (
  <S {...p}>
    <path d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
    <path d="M13.5 3v5h5M9 13h6M9 16.5h4" />
  </S>
);

export const IconImage = (p: IconProps) => (
  <S {...p}>
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
    <circle cx="9" cy="10" r="1.4" />
    <path d="m4.5 16.5 4.5-4.5 3 3 2.5-2.5 5 5" />
  </S>
);

export const IconFilm = (p: IconProps) => (
  <S {...p}>
    <rect x="4" y="4.5" width="16" height="15" rx="1.8" />
    <path d="M8 4.5v15M16 4.5v15M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4" />
  </S>
);

export const IconMusic = (p: IconProps) => (
  <S {...p}>
    <path d="M9 18V6.5L17.5 4.5V16" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="15.5" cy="16" r="2" />
  </S>
);

export const IconArchive = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="4.5" width="17" height="4.5" rx="1" />
    <path d="M5.5 9v9.5A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" />
  </S>
);

export const IconRefresh = (p: IconProps) => (
  <S {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <path d="M20.5 3.5V8H16" />
  </S>
);

export const IconTrash = (p: IconProps) => (
  <S {...p}>
    <path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="m6.5 7 .8 11.6A1.7 1.7 0 0 0 9 20.2h6a1.7 1.7 0 0 0 1.7-1.6L17.5 7" />
    <path d="M10 11v5.5M14 11v5.5" />
  </S>
);

export const IconX = (p: IconProps) => (
  <S {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </S>
);

export const IconCheck = (p: IconProps) => (
  <S {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </S>
);

export const IconChevronRight = (p: IconProps) => (
  <S {...p}>
    <path d="m9 5 7 7-7 7" />
  </S>
);

export const IconChevronDown = (p: IconProps) => (
  <S {...p}>
    <path d="m5 9 7 7 7-7" />
  </S>
);

export const IconChevronUp = (p: IconProps) => (
  <S {...p}>
    <path d="m5 15 7-7 7 7" />
  </S>
);

export const IconCloud = (p: IconProps) => (
  <S {...p}>
    <path d="M7 18.5A4.5 4.5 0 0 1 6.3 9.6 6 6 0 0 1 18 8.2a4.6 4.6 0 0 1-.9 9.3z" />
  </S>
);

export const IconCloudOff = (p: IconProps) => (
  <S {...p}>
    <path d="M8.6 18.5h8.5a4.6 4.6 0 0 0 .9-9.3A6 6 0 0 0 12 4c-.9 0-1.8.2-2.6.6M6.3 9.6A4.5 4.5 0 0 0 7 18.5" />
    <path d="m4 4 16 16" />
  </S>
);

export const IconAlert = (p: IconProps) => (
  <S {...p}>
    <path d="M12 4.5 2.8 20h18.4z" />
    <path d="M12 10.5v4M12 17.4h.01" strokeWidth="2" />
  </S>
);

export const IconPlus = (p: IconProps) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);

export const IconPencil = (p: IconProps) => (
  <S {...p}>
    <path d="m4.5 19.5.9-3.6L16.6 4.7a2 2 0 0 1 2.8 2.8L8.1 18.7z" />
  </S>
);

export const IconKey = (p: IconProps) => (
  <S {...p}>
    <circle cx="8" cy="15.5" r="4" />
    <path d="m11 12.5 8.5-8.5M15.5 8l2.5 2.5M18.5 5l2 2" />
  </S>
);

/** Spinner de progresso — anima via CSS (.spin). */
export const IconSpinner = (p: IconProps) => (
  <S {...p} className={`spin ${p.className ?? ''}`}>
    <path d="M12 3a9 9 0 1 1-6.4 2.6" />
  </S>
);

export function fileTypeIcon(name: string, mime: string | null, size = 16) {
  if (mime?.startsWith('image/')) return <IconImage size={size} />;
  if (mime?.startsWith('video/')) return <IconFilm size={size} />;
  if (mime?.startsWith('audio/')) return <IconMusic size={size} />;
  if (mime?.includes('zip') || mime?.includes('compressed') || mime?.includes('rar')) {
    return <IconArchive size={size} />;
  }
  if (mime?.startsWith('text/') || mime === 'application/pdf') return <IconFileText size={size} />;
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (['doc', 'docx', 'odt', 'md', 'txt'].includes(ext)) return <IconFileText size={size} />;
  return <IconFile size={size} />;
}
