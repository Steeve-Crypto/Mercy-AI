interface MercyLogoProps {
  active?: boolean;
}

export function MercyLogo({ active = false }: MercyLogoProps) {
  return (
    <div className={active ? "mercyLogo active" : "mercyLogo"} aria-label="Mercy Legal">
      <span>M</span>
    </div>
  );
}
