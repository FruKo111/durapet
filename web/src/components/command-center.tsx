"use client";

import { ReactNode } from "react";

type CommandAction = {
  id: string;
  label: string;
  description: string;
  icon?: ReactNode;
  onClick: () => void;
};

export function CommandCenter({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  actions: CommandAction[];
}) {
  return (
    <section className="kart command-center">
      <div className="command-center-head">
        <div>
          <h3 className="command-center-title">{title}</h3>
          <p className="command-center-subtitle">{subtitle}</p>
        </div>
        {badge ? <span className="command-center-badge">{badge}</span> : null}
      </div>
      <div className="command-center-actions">
        {actions.map((item) => (
          <button key={item.id} type="button" className="command-action-card" onClick={item.onClick}>
            <div className="command-action-title">
              {item.icon ? <span className="command-action-icon">{item.icon}</span> : null}
              <strong>{item.label}</strong>
            </div>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
