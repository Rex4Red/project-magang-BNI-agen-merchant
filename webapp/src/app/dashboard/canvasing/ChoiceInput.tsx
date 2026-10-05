"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./ChoiceInput.module.css";

export default function ChoiceInput({ label, value, options, onChange, placeholder, maxLength = 150 }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const closeMenu = useCallback(() => {
    if (menu.current?.matches(":popover-open")) menu.current.hidePopover();
  }, []);

  const placeMenu = useCallback(() => {
    if (!control.current || !menu.current) return;
    const bounds = control.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const topEdge = (viewport?.offsetTop ?? 0) + 8;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
    const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
    const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
    const below = Math.max(0, bottomEdge - bounds.bottom - 4);
    const above = Math.max(0, bounds.top - topEdge - 4);
    const desired = Math.min(272, options.length * 44 + 10);
    const upwards = below < desired && above > below;
    const width = Math.min(bounds.width, rightEdge - leftEdge);
    menu.current.style.width = `${width}px`;
    menu.current.style.left = `${Math.max(leftEdge, Math.min(bounds.left, rightEdge - width))}px`;
    menu.current.style.maxHeight = `${Math.min(272, upwards ? above : below)}px`;
    menu.current.style.top = `${upwards ? bounds.top - menu.current.offsetHeight - 4 : bounds.bottom + 4}px`;
  }, [options.length]);

  function showChoices() {
    setActive(-1);
    if (!menu.current?.matches(":popover-open")) menu.current?.showPopover();
    placeMenu();
  }

  function choose(option: string) {
    onChange(option);
    closeMenu();
    input.current?.setSelectionRange(option.length, option.length);
  }

  useEffect(() => {
    if (!open) return;
    // Close when the form moves; scrolling the choices themselves keeps them open.
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) closeMenu();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !field.current?.contains(event.target)) closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", placeMenu);
    window.visualViewport?.addEventListener("resize", placeMenu);
    window.visualViewport?.addEventListener("scroll", placeMenu);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", placeMenu);
      window.visualViewport?.removeEventListener("resize", placeMenu);
      window.visualViewport?.removeEventListener("scroll", placeMenu);
    };
  }, [open, closeMenu, placeMenu]);

  useEffect(() => {
    if (open && active >= 0) menu.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  return <div ref={field} className={styles.field} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu();
  }}>
    <label htmlFor={id}>{label}</label>
    <div ref={control} className={styles.control}>
      <input ref={input} id={id} className={styles.input} type="text" role="combobox"
        aria-expanded={open} aria-controls={`${id}-choices`} aria-autocomplete="none"
        aria-activedescendant={open && active >= 0 ? `${id}-choice-${active}` : undefined}
        autoComplete="off" maxLength={maxLength} value={value} placeholder={placeholder}
        onFocus={showChoices} onClick={showChoices}
        onChange={event => { onChange(event.target.value); showChoices(); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          const expanded = menu.current?.matches(":popover-open");
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!expanded) showChoices();
            const index = !expanded || active < 0
              ? (event.key === "ArrowDown" ? 0 : options.length - 1)
              : Math.max(0, Math.min(options.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)));
            setActive(index);
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (expanded && active >= 0) choose(options[active]);
            else closeMenu();
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault(); event.stopPropagation(); closeMenu();
          } else if (event.key === "Tab") {
            closeMenu();
          } else if (expanded && active >= 0 && (event.key === "Home" || event.key === "End")) {
            event.preventDefault(); setActive(event.key === "Home" ? 0 : options.length - 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            setActive(-1);
          }
        }} />
      <button type="button" className={styles.trigger} tabIndex={-1}
        aria-label={`Tampilkan semua pilihan ${label}`} aria-controls={`${id}-choices`} aria-expanded={open}
        onPointerDown={event => event.preventDefault()}
        onClick={() => { input.current?.focus({ preventScroll: true }); showChoices(); }}>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
    </div>
    <div ref={menu} id={`${id}-choices`} className={styles.menu} popover="manual"
      role="listbox" aria-label={`Pilihan ${label}`}
      onToggle={event => setOpen(event.newState === "open")}>
      {options.map((option, index) => <div key={option} id={`${id}-choice-${index}`} role="option"
        aria-selected={active >= 0 ? index === active : option === value}
        data-current={option === value} data-active={index === active} className={styles.option}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(option)}>
        <span>{option}</span>{option === value && <span className={styles.check} aria-hidden="true">✓</span>}
      </div>)}
    </div>
  </div>;
}
