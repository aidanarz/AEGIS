export function PageHeader({
  title,
  pillar,
  children,
}: {
  title: string;
  pillar?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {pillar && (
          <p className="mb-0.5 text-xs text-[#6B7280]">{pillar}</p>
        )}
        <h1 className="text-[19px] font-semibold tracking-tight text-[#111827]">{title}</h1>
      </div>
      {children && (
        <div className="flex items-center gap-3">{children}</div>
      )}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-6">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-[#111827]">{title}</h2>
        {description && (
          <p className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">{description}</p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}
