export function BrandLockup({ inverse = false }: { inverse?: boolean }) {
  return (
    <div data-testid="brand-lockup" className="min-w-0 text-left normal-case tracking-normal">
      <p className={`whitespace-nowrap text-lg font-bold leading-tight ${inverse ? "text-white" : "text-[#183c34]"}`}>
        GANITA<span className={inverse ? "text-[#48ddc0]" : "text-[#087968]"}>.ai</span>
      </p>
      <p className={`mt-1 whitespace-nowrap text-[11px] font-normal leading-4 ${inverse ? "text-white/70" : "text-[#587068]"}`}>
        count right. grow bright
      </p>
    </div>
  );
}
