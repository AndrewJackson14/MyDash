// EntityLink — inline navigable text. Wraps children in a <span> that acts like
// a link without using an actual <a href>. Pairs with useNav helpers:
//
//   <EntityLink onClick={nav.toClient(id)}>{client.name}</EntityLink>
//
// Defaults:
//   * stopPropagation on click so row-level onClick handlers never fire when a
//     user clicks a cell link (the #1 foot-gun in clickable-row tables).
//   * role="link" + tabIndex=0 + Enter/Space key handler for keyboard users.
//   * muted variant uses tm color and hovers to tx (not blue) — for secondary
//     context fields like pub names inside a data row.
//   * noUnderline skips the underline layer — useful when the link sits inside
//     a visual element that already has its own hover state (e.g. status pill).

import { Z } from "../../lib/theme";

const LINK_BLUE = "#486b95"; // MyDash brand steel-blue

export function EntityLink({
  onClick,
  children,
  muted = false,
  noUnderline = false,
  title,
  style,
  className,
  stopPropagation = true,
}) {
  const handleClick = (e) => {
    if (stopPropagation) e.stopPropagation();
    if (onClick) onClick(e);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      if (onClick) onClick(e);
    }
  };

  const baseStyle = {
    cursor: "pointer",
    color: muted ? Z.tm : "inherit",
    textDecoration: noUnderline ? "none" : "underline",
    textDecorationColor: "transparent",
    textUnderlineOffset: 3,
    transition: "color 140ms, text-decoration-color 140ms",
    outlineOffset: 2,
  };

  const onMouseOver = (e) => {
    e.currentTarget.style.color = muted ? Z.tx : LINK_BLUE;
    if (!noUnderline) e.currentTarget.style.textDecorationColor = muted ? Z.tx : LINK_BLUE;
  };
  const onMouseOut = (e) => {
    e.currentTarget.style.color = baseStyle.color;
    if (!noUnderline) e.currentTarget.style.textDecorationColor = "transparent";
  };

  return (
    <span
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
      title={title}
      className={className}
      style={{ ...baseStyle, ...style }}
    >
      {children}
    </span>
  );
}

export default EntityLink;
