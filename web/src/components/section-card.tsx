"use client";

import { ReactNode } from "react";

export function SectionCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`kart bolum-kart section-card ${className}`.trim()}>
      <div className="section-card-head">
        <h3 className="bolum-baslik">{title}</h3>
        {subtitle ? <p className="section-card-subtitle">{subtitle}</p> : null}
      </div>
      {children}
    </article>
  );
}
