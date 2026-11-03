import Image from "next/image";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/VERLINDE.svg"
      alt="Verlinde"
      width={500}
      height={500}
      unoptimized
      draggable={false}
      className={`max-h-full max-w-full object-contain ${className}`}
    />
  );
}
