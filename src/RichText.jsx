import { useState, useRef, useCallback, useEffect } from "react";

/**
 * RichText – feature-flagged rich text editor
 *
 * Props
 * ─────
 * value        string             Controlled HTML content
 * onChange     (html) => void     Called on every change
 * placeholder  string             Placeholder text
 * minHeight    number             Editor min-height in px (default 320)
 *
 * Feature flags  (all default to true unless stated)
 * ─────────────────────────────────────────────────
 * media   bool   Image upload + URL insert + image resize/align overlay
 * table   bool   Insert table + table context toolbar
 * links   bool   Insert link / unlink buttons
 * simple  bool   When true → text formatting only (bold/italic/underline/
 *                strikethrough, lists, indent, headings, undo/redo).
 *                Disables colors, highlights, alignment, blockquote,
 *                code, HR, font family/size pickers, and also overrides
 *                media / table / links to false.
 *
 * Examples
 * ────────
 * <RichText />                          // all features on
 * <RichText media={false} />            // no image tools
 * <RichText table={false} links={false} />
 * <RichText simple />                   // plain text tools only
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const FONTS = ["Default", "Serif", "Monospace", "Georgia", "Verdana"];
const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "36", "48"];

const TABLE_STYLES = [
  { id: "default",  label: "Default",  border: "1px solid #d1d5db", headerBg: "#f9fafb",     headerColor: "#111827", cellBg: "#fff", stripeBg: "#f9fafb" },
  { id: "blue",     label: "Blue",     border: "1px solid #93c5fd", headerBg: "#1d4ed8",     headerColor: "#fff",    cellBg: "#fff", stripeBg: "#eff6ff" },
  { id: "green",    label: "Green",    border: "1px solid #86efac", headerBg: "#15803d",     headerColor: "#fff",    cellBg: "#fff", stripeBg: "#f0fdf4" },
  { id: "red",      label: "Red",      border: "1px solid #fca5a5", headerBg: "#b91c1c",     headerColor: "#fff",    cellBg: "#fff", stripeBg: "#fef2f2" },
  { id: "dark",     label: "Dark",     border: "1px solid #374151", headerBg: "#111827",     headerColor: "#fff",    cellBg: "#fff", stripeBg: "#f3f4f6" },
  { id: "minimal",  label: "Minimal",  border: "none",              headerBg: "transparent", headerColor: "#111827", cellBg: "#fff", stripeBg: "#f9fafb" },
  { id: "bordered", label: "Borders",  border: "2px solid #111827", headerBg: "#f3f4f6",     headerColor: "#111827", cellBg: "#fff", stripeBg: "#f9fafb" },
];

const IMG_ALIGNMENTS = [
  { id: "none",   label: "Inline",  title: "Inline with text",       style: { display: "inline", float: "none",  margin: "4px" } },
  { id: "left",   label: "Float L", title: "Float left, text wraps",  style: { display: "block", float: "left",  margin: "4px 12px 4px 0" } },
  { id: "center", label: "Center",  title: "Centered, full row",      style: { display: "block", float: "none",  margin: "8px auto" } },
  { id: "right",  label: "Float R", title: "Float right, text wraps", style: { display: "block", float: "right", margin: "4px 0 4px 12px" } },
];

// ─── Table helpers ─────────────────────────────────────────────────────────────

function applyTableStyle(table, styleId, striped, hasHeader) {
  const ts = TABLE_STYLES.find(s => s.id === styleId) || TABLE_STYLES[0];
  table.style.borderCollapse = "collapse";
  table.style.width = "100%";
  table.style.margin = "8px 0";
  table.dataset.styleId = styleId;
  table.dataset.striped = striped ? "1" : "0";
  table.dataset.hasHeader = hasHeader ? "1" : "0";

  Array.from(table.querySelectorAll("tr")).forEach((row, ri) => {
    const isHeader = hasHeader && ri === 0;
    const isStripe = striped && !isHeader && ri % 2 === 0;
    Array.from(row.querySelectorAll("td, th")).forEach(cell => {
      cell.style.border = ts.border;
      cell.style.padding = "7px 12px";
      cell.style.minWidth = "60px";
      if (isHeader) {
        cell.style.background = ts.headerBg;
        cell.style.color = ts.headerColor;
        cell.style.fontWeight = "600";
        if (cell.tagName === "TD") {
          const th = document.createElement("th");
          th.innerHTML = cell.innerHTML;
          th.style.cssText = cell.style.cssText;
          cell.parentNode.replaceChild(th, cell);
        }
      } else {
        cell.style.background = isStripe ? ts.stripeBg : ts.cellBg;
        cell.style.color = "#1f2937";
        cell.style.fontWeight = "normal";
      }
    });
  });
}

const getParentTable = node => { let el = node; while (el) { if (el.tagName === "TABLE") return el; el = el.parentElement; } return null; };
const getParentCell  = node => { let el = node; while (el) { if (el.tagName === "TD" || el.tagName === "TH") return el; el = el.parentElement; } return null; };
const getParentRow   = node => { let el = node; while (el) { if (el.tagName === "TR") return el; el = el.parentElement; } return null; };
const getCellIndex   = cell => Array.from(cell.parentElement.children).indexOf(cell);

function applyAlignment(img, alignId) {
  const a = IMG_ALIGNMENTS.find(x => x.id === alignId) || IMG_ALIGNMENTS[0];
  Object.assign(img.style, a.style);
  img.dataset.align = alignId;
  const parent = img.parentElement;
  if ((alignId === "left" || alignId === "right") && parent && !parent.classList.contains("img-float-wrap")) {
    const wrap = document.createElement("div");
    wrap.className = "img-float-wrap";
    wrap.style.overflow = "hidden";
    wrap.style.width = "100%";
    parent.insertBefore(wrap, img);
    wrap.appendChild(img);
  } else if (alignId !== "left" && alignId !== "right" && parent?.classList.contains("img-float-wrap")) {
    const gp = parent.parentElement;
    if (gp) { gp.insertBefore(img, parent); parent.remove(); }
  }
}

// ─── UI primitives ─────────────────────────────────────────────────────────────

const ToolbarButton = ({ onMouseDown, active, title, children, disabled }) => (
  <button
    onMouseDown={onMouseDown} title={title} disabled={disabled}
    style={{ padding: "5px 6px", background: active ? "#dbeafe" : "transparent", border: active ? "1px solid #93c5fd" : "1px solid transparent", borderRadius: "5px", cursor: disabled ? "not-allowed" : "pointer", color: disabled ? "#aaa" : active ? "#1d4ed8" : "#374151", fontSize: "13px", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "28px", height: "28px", transition: "all 0.1s", userSelect: "none", flexShrink: 0 }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = active ? "#dbeafe" : "#f3f4f6"; }}
    onMouseLeave={e => { e.currentTarget.style.background = active ? "#dbeafe" : "transparent"; }}>
    {children}
  </button>
);

const Divider  = () => <span style={{ width: "1px", height: "20px", background: "#e5e7eb", margin: "0 2px", display: "inline-block", alignSelf: "center", flexShrink: 0 }} />;
const TDivider = () => <span style={{ width: "1px", height: "16px", background: "#334155", margin: "0 3px", alignSelf: "center", display: "inline-block", flexShrink: 0 }} />;

const SVG = ({ children, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const TBtn = ({ onClick, title, children, active, danger }) => (
  <button
    onMouseDown={e => { e.preventDefault(); onClick?.(); }} title={title}
    style={{ padding: "3px 7px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: 500, background: active ? "#3b82f6" : "transparent", color: active ? "#fff" : danger ? "#fca5a5" : "#cbd5e1", display: "inline-flex", alignItems: "center", gap: "3px", height: "22px", whiteSpace: "nowrap", flexShrink: 0 }}
    onMouseEnter={e => { e.currentTarget.style.background = active ? "#2563eb" : danger ? "#7f1d1d" : "#334155"; }}
    onMouseLeave={e => { e.currentTarget.style.background = active ? "#3b82f6" : "transparent"; }}>
    {children}
  </button>
);

// Mobile collapsible group
const ToolGroup = ({ children, label, isMobile }) => {
  const [open, setOpen] = useState(false);
  if (!isMobile) return <>{children}</>;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
        style={{ padding: "4px 7px", height: "28px", borderRadius: "5px", border: open ? "1px solid #93c5fd" : "1px solid #e5e7eb", background: open ? "#dbeafe" : "#fff", color: open ? "#1d4ed8" : "#374151", fontSize: "11px", fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
        {label} <span style={{ fontSize: "9px" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "6px", display: "flex", flexWrap: "wrap", gap: "2px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 200, minWidth: "160px" }}>
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Container-width hook ──────────────────────────────────────────────────────

function useContainerWidth(ref) {
  const [width, setWidth] = useState(9999);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    setWidth(element.offsetWidth);

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return width;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function RichText({
  value,
  onChange,
  placeholder = "Start writing…",
  minHeight = 320,
  // Feature flags
  media  = true,
  table  = true,
  links  = true,
  simple = false,
}) {
  // simple mode overrides everything else
  const feat = {
    media:  simple ? false : media,
    table:  simple ? false : table,
    links:  simple ? false : links,
    colors: !simple,   // text color + highlight
    align:  !simple,   // justify buttons
    fonts:  !simple,   // font family / size pickers
    extras: !simple,   // blockquote, inline code, HR
  };

  const editorRef      = useRef(null);
  const fileInputRef   = useRef(null);
  const containerRef   = useRef(null);
  const tableToolbarRef = useRef(null);
  const overlayRef     = useRef(null);
  const dragImgRef     = useRef(null);
  const savedRange     = useRef(null);

  const [activeFormats,   setActiveFormats]   = useState({});
  const [linkDialogOpen,  setLinkDialogOpen]  = useState(false);
  const [linkUrl,         setLinkUrl]         = useState("");
  const [tableCtx,        setTableCtx]        = useState(null);
  const [selectedImg,     setSelectedImg]     = useState(null);

  const containerWidth = useContainerWidth(containerRef);
  const isMobile  = containerWidth < 600;
  const isNarrow  = containerWidth < 420;

  // ── Overlay refresh ──────────────────────────────────────────────────────────
  const refreshOverlay = useCallback(() => {
    setSelectedImg(s => s?.el ? { ...s, rect: s.el.getBoundingClientRect() } : null);
    setTableCtx(t => t?.table ? { ...t, rect: t.table.getBoundingClientRect() } : null);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", refreshOverlay, true);
    window.addEventListener("resize", refreshOverlay);
    return () => { window.removeEventListener("scroll", refreshOverlay, true); window.removeEventListener("resize", refreshOverlay); };
  }, [refreshOverlay]);

  // Click-outside
  useEffect(() => {
    const handler = e => {
      if (overlayRef.current?.contains(e.target))      return;
      if (tableToolbarRef.current?.contains(e.target)) return;
      if (selectedImg && e.target === selectedImg.el)   return;
      setSelectedImg(null);
      if (!editorRef.current?.contains(e.target) && !tableToolbarRef.current?.contains(e.target))
        setTableCtx(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedImg]);

  // ── Editor click ─────────────────────────────────────────────────────────────
  const handleEditorClick = useCallback(e => {
    if (feat.media && e.target.tagName === "IMG") {
      e.preventDefault();
      setTableCtx(null);
      const img = e.target;
      const rect = img.getBoundingClientRect();
      setSelectedImg({ el: img, rect, w: rect.width, h: rect.height, alignId: img.dataset.align || "none" });
      return;
    }
    setSelectedImg(null);
    if (feat.table) {
      const cell = getParentCell(e.target);
      const tbl  = cell ? getParentTable(cell) : null;
      if (cell && tbl) {
        setTableCtx({ table: tbl, cell, row: getParentRow(cell), rect: tbl.getBoundingClientRect(), styleId: tbl.dataset.styleId || "default", striped: tbl.dataset.striped === "1", hasHeader: tbl.dataset.hasHeader === "1" });
      } else {
        setTableCtx(null);
      }
    }
  }, [feat.media, feat.table]);

  // ── emitChange / exec ────────────────────────────────────────────────────────
  const emitChange = useCallback(() => {
    if (onChange && editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const exec = useCallback((cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    setActiveFormats({
      bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"), strikeThrough: document.queryCommandState("strikeThrough"),
      insertOrderedList: document.queryCommandState("insertOrderedList"), insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      justifyLeft: document.queryCommandState("justifyLeft"), justifyCenter: document.queryCommandState("justifyCenter"), justifyRight: document.queryCommandState("justifyRight"),
    });
    emitChange();
  }, [emitChange]);

  const updateFormats = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"), strikeThrough: document.queryCommandState("strikeThrough"),
      insertOrderedList: document.queryCommandState("insertOrderedList"), insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      justifyLeft: document.queryCommandState("justifyLeft"), justifyCenter: document.queryCommandState("justifyCenter"), justifyRight: document.queryCommandState("justifyRight"),
    });
  }, []);

 useEffect(() => {
  if (
    editorRef.current &&
    value !== undefined &&
    editorRef.current.innerHTML !== value
  ) {
    editorRef.current.innerHTML = value || "";
  }
}, [value]);

  // ── Table operations ─────────────────────────────────────────────────────────
  const tableOp = useCallback(op => {
    if (!tableCtx) return;
    const { table, cell, row } = tableCtx;
    const tbody    = table.querySelector("tbody") || table;
    const rows     = Array.from(tbody.querySelectorAll("tr"));
    const colIdx   = getCellIndex(cell);
    const colCount = rows[0]?.children.length ?? 1;

    const makeCell = (tag = "td") => {
      const c = document.createElement(tag);
      c.style.cssText = "border:1px solid #d1d5db;padding:7px 12px;min-width:60px";
      c.innerHTML = "&nbsp;";
      return c;
    };

    if (op === "insertRowAbove" || op === "insertRowBelow") {
      const newRow = document.createElement("tr");
      for (let i = 0; i < colCount; i++) newRow.appendChild(makeCell());
      tbody.insertBefore(newRow, op === "insertRowAbove" ? row : row.nextSibling || null);
    }
    if (op === "insertColLeft" || op === "insertColRight") {
      rows.forEach((r, ri) => {
        const tag = tableCtx.hasHeader && ri === 0 ? "th" : "td";
        const idx = op === "insertColLeft" ? colIdx : colIdx + 1;
        r.insertBefore(makeCell(tag), r.children[idx] || null);
      });
    }
    if (op === "deleteRow"  && rows.length > 1)  row.remove();
    if (op === "deleteCol"  && colCount > 1)      rows.forEach(r => r.children[colIdx]?.remove());
    if (op === "deleteTable") { table.remove(); setTableCtx(null); emitChange(); return; }
    if (op === "mergeCellRight") {
      const next = cell.nextElementSibling;
      if (next) { const span = parseInt(cell.getAttribute("colspan") || 1) + 1; cell.setAttribute("colspan", span); cell.style.minWidth = (60 * span) + "px"; next.remove(); }
    }
    if (op === "splitCell") {
      const span = parseInt(cell.getAttribute("colspan") || 1);
      if (span > 1) { cell.setAttribute("colspan", 1); cell.style.minWidth = "60px"; for (let i = 1; i < span; i++) cell.parentNode.insertBefore(makeCell(cell.tagName.toLowerCase()), cell.nextSibling); }
    }
    if (op === "addHeaderRow") {
      const hasH = !tableCtx.hasHeader;
      applyTableStyle(table, tableCtx.styleId, tableCtx.striped, hasH);
      setTableCtx(t => ({ ...t, hasHeader: hasH })); emitChange(); return;
    }
    if (op === "toggleStripe") {
      const s = !tableCtx.striped;
      applyTableStyle(table, tableCtx.styleId, s, tableCtx.hasHeader);
      setTableCtx(t => ({ ...t, striped: s })); emitChange(); return;
    }
    applyTableStyle(table, tableCtx.styleId, tableCtx.striped, tableCtx.hasHeader);
    setTableCtx(t => t ? { ...t, rect: table.getBoundingClientRect() } : null);
    emitChange();
  }, [tableCtx, emitChange]);

  const applyTableStyleProp = useCallback(styleId => {
    if (!tableCtx) return;
    applyTableStyle(tableCtx.table, styleId, tableCtx.striped, tableCtx.hasHeader);
    setTableCtx(t => t ? { ...t, styleId } : null);
    emitChange();
  }, [tableCtx, emitChange]);

  const setCellBg        = useCallback(c => { if (tableCtx?.cell) { tableCtx.cell.style.background   = c; emitChange(); } }, [tableCtx, emitChange]);
  const setCellTextColor = useCallback(c => { if (tableCtx?.cell) { tableCtx.cell.style.color         = c; emitChange(); } }, [tableCtx, emitChange]);
  const setCellAlign     = useCallback(a => { if (tableCtx?.cell) { tableCtx.cell.style.textAlign     = a; emitChange(); } }, [tableCtx, emitChange]);
  const setCellVAlign    = useCallback(v => { if (tableCtx?.cell) { tableCtx.cell.style.verticalAlign = v; emitChange(); } }, [tableCtx, emitChange]);

  // ── Image resize ─────────────────────────────────────────────────────────────
  const startResize = useCallback((e, handleId) => {
    e.preventDefault(); e.stopPropagation();
    if (!selectedImg) return;
    const img = selectedImg.el;
    const startX = e.clientX, startY = e.clientY, startW = img.offsetWidth, startH = img.offsetHeight, aspect = startW / startH;
    const onMove = ev => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      let nW = startW, nH = startH;
      if (handleId.includes("e")) nW = Math.max(40, startW + dx);
      if (handleId.includes("w")) nW = Math.max(40, startW - dx);
      if (handleId.includes("s")) nH = Math.max(40, startH + dy);
      if (handleId.includes("n")) nH = Math.max(40, startH - dy);
      if (handleId.length === 2) { if (handleId.includes("e") || handleId.includes("w")) nH = nW / aspect; else nW = nH * aspect; }
      img.style.width = Math.round(nW) + "px"; img.style.height = Math.round(nH) + "px";
      setSelectedImg(s => s ? { ...s, rect: img.getBoundingClientRect() } : null);
    };
    const onUp = () => { emitChange(); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }, [selectedImg, emitChange]);

  const handleImgDragStart = useCallback(e => {
    if (!selectedImg) return;
    dragImgRef.current = selectedImg.el;
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.cssText = "position:fixed;top:-9999px;width:1px;height:1px;";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
    selectedImg.el.style.opacity = "0.4";
  }, [selectedImg]);

  useEffect(() => {
    const editor = editorRef.current; if (!editor) return;
    let dropIndicator = null;
    const onDragOver = e => {
      if (!dragImgRef.current) return; e.preventDefault();
      const range = document.caretRangeFromPoint(e.clientX, e.clientY); if (!range) return;
      dropIndicator?.remove();
      dropIndicator = document.createElement("span");
      dropIndicator.id = "__drop_indicator__";
      dropIndicator.style.cssText = "display:inline-block;width:2px;height:1.2em;background:#3b82f6;vertical-align:middle;border-radius:2px;margin:0 1px;pointer-events:none;";
      range.insertNode(dropIndicator);
    };
    const onDrop = e => {
      e.preventDefault(); const img = dragImgRef.current; if (!img) return;
      img.style.opacity = "";
      const ind = editor.querySelector("#__drop_indicator__");
      if (ind) { ind.parentNode.insertBefore(img, ind); ind.remove(); }
      dragImgRef.current = null; emitChange();
      setSelectedImg(s => s ? { ...s, rect: img.getBoundingClientRect() } : null);
    };
    const onDragEnd = () => {
      if (dragImgRef.current) dragImgRef.current.style.opacity = "";
      dragImgRef.current = null;
      editor.querySelector("#__drop_indicator__")?.remove();
      dropIndicator?.remove(); dropIndicator = null;
    };
    editor.addEventListener("dragover", onDragOver);
    editor.addEventListener("drop", onDrop);
    editor.addEventListener("dragend", onDragEnd);
    return () => { editor.removeEventListener("dragover", onDragOver); editor.removeEventListener("drop", onDrop); editor.removeEventListener("dragend", onDragEnd); };
  }, [emitChange]);

  const setImgAlignment = useCallback(alignId => {
    if (!selectedImg) return;
    applyAlignment(selectedImg.el, alignId);
    setSelectedImg(s => s ? { ...s, alignId } : null);
    emitChange();
  }, [selectedImg, emitChange]);

  // ── Insert helpers ───────────────────────────────────────────────────────────
  const saveRange    = () => { const s = window.getSelection(); if (s?.rangeCount > 0) savedRange.current = s.getRangeAt(0).cloneRange(); };
  const restoreRange = () => { if (savedRange.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange.current); } };

  const handleImageUpload = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { editorRef.current?.focus(); document.execCommand("insertImage", false, ev.target.result); emitChange(); };
    reader.readAsDataURL(file); e.target.value = "";
  };
  const handleImageUrl = () => { const u = prompt("Enter image URL:"); if (u) { editorRef.current?.focus(); document.execCommand("insertImage", false, u); emitChange(); } };
  const handleInsertLink = () => { saveRange(); setLinkUrl(""); setLinkDialogOpen(true); };
  const confirmLink = () => {
    restoreRange(); editorRef.current?.focus();
    let url = linkUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    if (url) document.execCommand("createLink", false, url);
    setLinkDialogOpen(false); emitChange();
  };

  const handleFontFamily = e => exec("fontName", e.target.value === "Default" ? "inherit" : e.target.value);
  const handleFontSize   = e => {
    const px = e.target.value; editorRef.current?.focus();
    document.execCommand("fontSize", false, "7");
    editorRef.current.querySelectorAll('font[size="7"]').forEach(f => { f.removeAttribute("size"); f.style.fontSize = px + "px"; });
    emitChange();
  };
  const handleKeyDown = e => { if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertHTML", false, "&nbsp;&nbsp;&nbsp;&nbsp;"); } };

  const insertTable = () => {
    const html = `<table data-style-id="default" data-striped="0" data-has-header="1" style="border-collapse:collapse;width:100%;margin:8px 0"><tbody>${
      Array.from({length:3},(_,ri)=>`<tr>${Array.from({length:3},()=>ri===0?`<th style="border:1px solid #d1d5db;padding:7px 12px;min-width:60px;background:#f9fafb;font-weight:600">&nbsp;</th>`:`<td style="border:1px solid #d1d5db;padding:7px 12px;min-width:60px">&nbsp;</td>`).join("")}</tr>`).join("")
    }</tbody></table><p><br></p>`;
    exec("insertHTML", html);
  };
  const insertBlockquote = () => exec("insertHTML", `<blockquote style="border-left:4px solid #3b82f6;margin:8px 0;padding:8px 16px;color:#4b5563;background:#f8fafc;border-radius:0 6px 6px 0"><br></blockquote>`);
  const insertCode       = () => { const t = window.getSelection()?.toString() || "code"; exec("insertHTML", `<code style="font-family:monospace;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:1px 5px;font-size:0.93em">${t}</code>`); };

  // ── Shared select style ──────────────────────────────────────────────────────
  const selectStyle = { height: "28px", borderRadius: "5px", border: "1px solid #e5e7eb", padding: "0 4px", fontSize: "12px", color: "#374151", background: "#fff", cursor: "pointer", flexShrink: 0 };

  // ── Toolbar sections (reusable across desktop/mobile) ────────────────────────

  const coreTools = (
    <>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("bold")}}          active={activeFormats.bold}          title="Bold"><strong style={{fontSize:"13px"}}>B</strong></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("italic")}}        active={activeFormats.italic}        title="Italic"><em style={{fontSize:"13px"}}>I</em></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("underline")}}     active={activeFormats.underline}     title="Underline"><span style={{textDecoration:"underline",fontSize:"13px"}}>U</span></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("strikeThrough")}} active={activeFormats.strikeThrough} title="Strikethrough"><span style={{textDecoration:"line-through",fontSize:"13px"}}>S</span></ToolbarButton>
    </>
  );

  const colorTools = feat.colors && (
    <>
      <label title="Text color" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer",width:"28px",height:"28px",borderRadius:"5px",border:"1px solid transparent",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.background="#f3f4f6"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <SVG><path d="M4 20h16M12 4l-7 12h14L12 4z"/></SVG>
        <input type="color" style={{width:0,height:0,opacity:0,position:"absolute"}} onChange={e=>exec("foreColor",e.target.value)}/>
      </label>
      <label title="Highlight" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer",width:"28px",height:"28px",borderRadius:"5px",border:"1px solid transparent",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.background="#f3f4f6"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <SVG><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M9 8h6M9 16h4"/></SVG>
        <input type="color" defaultValue="#fef08a" style={{width:0,height:0,opacity:0,position:"absolute"}} onChange={e=>exec("hiliteColor",e.target.value)}/>
      </label>
    </>
  );

  const alignTools = feat.align && (
    <>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("justifyLeft")}}   active={activeFormats.justifyLeft}   title="Left">  <SVG><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></SVG></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("justifyCenter")}} active={activeFormats.justifyCenter} title="Center"><SVG><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></SVG></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("justifyRight")}}  active={activeFormats.justifyRight}  title="Right"> <SVG><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></SVG></ToolbarButton>
    </>
  );

  const listTools = (
    <>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("insertUnorderedList")}} active={activeFormats.insertUnorderedList} title="Bullet list"><SVG><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></SVG></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("insertOrderedList")}}   active={activeFormats.insertOrderedList}   title="Numbered list"><SVG><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="7" strokeWidth="0" fill="currentColor">1.</text><text x="2" y="14" fontSize="7" strokeWidth="0" fill="currentColor">2.</text><text x="2" y="20" fontSize="7" strokeWidth="0" fill="currentColor">3.</text></SVG></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("indent")}}  title="Indent"> <SVG><line x1="3" y1="6" x2="21" y2="6"/><polyline points="3 12 8 12"/><line x1="11" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><polyline points="3 9 6 12 3 15"/></SVG></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("outdent")}} title="Outdent"><SVG><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><polyline points="9 9 6 12 9 15"/></SVG></ToolbarButton>
    </>
  );

  const insertTools = (
    <>
      {feat.links && <>
        <ToolbarButton onMouseDown={e=>{e.preventDefault();handleInsertLink()}} title="Link"><SVG><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></SVG></ToolbarButton>
        <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("unlink")}}     title="Unlink"><SVG><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><line x1="3" y1="3" x2="21" y2="21"/></SVG></ToolbarButton>
      </>}
      {feat.media && <>
        <label title="Insert image (file)" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer",width:"28px",height:"28px",borderRadius:"5px",border:"1px solid transparent",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.background="#f3f4f6"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <SVG><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></SVG>
          <input type="file" accept="image/*" ref={fileInputRef} style={{display:"none"}} onChange={handleImageUpload}/>
        </label>
        <ToolbarButton onMouseDown={e=>{e.preventDefault();handleImageUrl()}} title="Insert image (URL)"><SVG><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></SVG></ToolbarButton>
      </>}
      {feat.extras && <>
        <ToolbarButton onMouseDown={e=>{e.preventDefault();insertBlockquote()}} title="Blockquote"><SVG><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></SVG></ToolbarButton>
        <ToolbarButton onMouseDown={e=>{e.preventDefault();insertCode()}}      title="Inline code"><SVG><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></SVG></ToolbarButton>
      </>}
      {feat.table && (
        <ToolbarButton onMouseDown={e=>{e.preventDefault();insertTable()}} title="Insert table"><SVG><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></SVG></ToolbarButton>
      )}
      {feat.extras && (
        <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("insertHorizontalRule")}} title="Horizontal rule"><SVG><line x1="3" y1="12" x2="21" y2="12"/></SVG></ToolbarButton>
      )}
    </>
  );

  const historyTools = (
    <>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("undo")}}         title="Undo"><SVG><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></SVG></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("redo")}}         title="Redo"><SVG><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.95"/></SVG></ToolbarButton>
      <ToolbarButton onMouseDown={e=>{e.preventDefault();exec("removeFormat")}} title="Clear formatting"><SVG><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/><line x1="3" y1="3" x2="21" y2="21"/></SVG></ToolbarButton>
    </>
  );

  // Has any insert-group tool to show?
  const hasInsertGroup = feat.links || feat.media || feat.extras || feat.table;

  // ── Toolbar renderer ─────────────────────────────────────────────────────────
  const renderToolbar = () => {
    if (!isMobile) {
      // Desktop: everything in one row
      return (
        <>
          {feat.fonts && <>
            <select onChange={handleFontFamily} title="Font" style={{...selectStyle, width:"90px"}}>{FONTS.map(f => <option key={f}>{f}</option>)}</select>
            <select onChange={handleFontSize}   title="Size" style={{...selectStyle, width:"52px"}}>{FONT_SIZES.map(s => <option key={s}>{s}</option>)}</select>
            <Divider />
          </>}
          {coreTools}
          {feat.colors && <><Divider />{colorTools}</>}
          {feat.align  && <><Divider />{alignTools}</>}
          <Divider />
          {listTools}
          {feat.fonts && <>
            <Divider />
            <select onChange={e=>{exec("formatBlock",e.target.value);e.target.value="p"}} title="Block style" style={{...selectStyle, width:"110px"}}>
              <option value="p">Paragraph</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="h4">Heading 4</option>
              <option value="pre">Preformatted</option>
            </select>
          </>}
          {hasInsertGroup && <><Divider />{insertTools}</>}
          <Divider />
          {historyTools}
        </>
      );
    }

    // Mobile: compact with collapsible groups
    return (
      <>
        {coreTools}
        <Divider />
        {historyTools}
        {feat.fonts && <>
          <Divider />
          <ToolGroup label="Aa" isMobile>
            <select onChange={handleFontFamily} title="Font" style={{...selectStyle, width:"90px", marginBottom:"4px"}}>{FONTS.map(f => <option key={f}>{f}</option>)}</select>
            <select onChange={handleFontSize}   title="Size" style={{...selectStyle, width:"52px", marginBottom:"4px"}}>{FONT_SIZES.map(s => <option key={s}>{s}</option>)}</select>
            <select onChange={e=>{exec("formatBlock",e.target.value);e.target.value="p"}} title="Block" style={{...selectStyle, width:"110px"}}>
              <option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option><option value="h4">Heading 4</option><option value="pre">Preformatted</option>
            </select>
          </ToolGroup>
        </>}
        {feat.colors && <><Divider /><ToolGroup label="Color" isMobile>{colorTools}</ToolGroup></>}
        {feat.align  && !isNarrow && <><Divider /><ToolGroup label="Align" isMobile>{alignTools}</ToolGroup></>}
        <Divider />
        <ToolGroup label="List" isMobile>{listTools}</ToolGroup>
        {hasInsertGroup && <><Divider /><ToolGroup label="Insert" isMobile>{insertTools}</ToolGroup></>}
      </>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const tableToolbarPos = tableCtx?.table ? (() => { const r = tableCtx.table.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width }; })() : null;
  const overlayRect     = selectedImg?.el ? selectedImg.el.getBoundingClientRect() : null;

  return (
    <div ref={containerRef} style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", border: "1px solid #d1d5db", borderRadius: "10px", overflow: "visible", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", position: "relative", width: "100%", boxSizing: "border-box" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px", padding: isMobile ? "5px 6px" : "6px 8px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", alignItems: "center", borderRadius: "10px 10px 0 0", minHeight: "42px" }}>
        {renderToolbar()}
      </div>

      {/* ── Editor ── */}
      <div
        ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={emitChange} onKeyUp={updateFormats} onMouseUp={updateFormats}
        onKeyDown={handleKeyDown} onPaste={() => setTimeout(emitChange, 0)} onClick={handleEditorClick}
        data-placeholder={placeholder}
        style={{ minHeight, padding: isMobile ? "14px 16px" : "20px 24px", outline: "none", fontSize: isMobile ? "14px" : "15px", lineHeight: "1.7", color: "#1f2937", overflowY: "auto", overflowX: "auto", wordBreak: "break-word", boxSizing: "border-box" }}
      />

      {/* ── Link dialog ── */}
      {feat.links && linkDialogOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }}>
          <div style={{ background:"#fff", borderRadius:"10px", padding:"24px", width:"100%", maxWidth:"360px", boxShadow:"0 8px 32px rgba(0,0,0,0.18)", display:"flex", flexDirection:"column", gap:"14px", boxSizing:"border-box" }}>
            <p style={{ margin:0, fontWeight:600, fontSize:"15px", color:"#111827" }}>Insert link</p>
            <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") confirmLink(); if (e.key==="Escape") setLinkDialogOpen(false); }}
              placeholder="https://example.com"
              style={{ padding:"8px 12px", borderRadius:"6px", border:"1px solid #d1d5db", fontSize:"14px", outline:"none", width:"100%", boxSizing:"border-box" }}/>
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button onClick={() => setLinkDialogOpen(false)} style={{ padding:"7px 16px", borderRadius:"6px", border:"1px solid #e5e7eb", background:"#f9fafb", cursor:"pointer", fontSize:"13px" }}>Cancel</button>
              <button onClick={confirmLink} style={{ padding:"7px 16px", borderRadius:"6px", border:"none", background:"#3b82f6", color:"#fff", cursor:"pointer", fontSize:"13px", fontWeight:500 }}>Insert</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table context toolbar ── */}
      {feat.table && tableCtx && tableToolbarPos && (
        <div ref={tableToolbarRef} style={{ position:"fixed", left: isMobile ? 0 : tableToolbarPos.left, right: isMobile ? 0 : "auto", top: isMobile ? "auto" : tableToolbarPos.top - 44, bottom: isMobile ? 0 : "auto", minWidth: isMobile ? "100%" : Math.max(tableToolbarPos.width, 600), background:"#1e293b", borderRadius: isMobile ? "12px 12px 0 0" : "8px", padding: isMobile ? "8px 10px" : "5px 8px", display:"flex", flexWrap:"wrap", gap:"2px", alignItems:"center", boxShadow:"0 4px 20px rgba(0,0,0,0.3)", zIndex:1001, userSelect:"none", overflowX: isMobile ? "auto" : "visible" }}>
          <TBtn onClick={()=>tableOp("insertRowAbove")} title="Row above"><SVG size={11}><rect x="3" y="3" width="18" height="7" rx="1"/><line x1="12" y1="14" x2="12" y2="21"/><line x1="8" y1="17" x2="16" y2="17"/></SVG> Row ↑</TBtn>
          <TBtn onClick={()=>tableOp("insertRowBelow")} title="Row below"><SVG size={11}><rect x="3" y="14" width="18" height="7" rx="1"/><line x1="12" y1="3" x2="12" y2="10"/><line x1="8" y1="7" x2="16" y2="7"/></SVG> Row ↓</TBtn>
          <TBtn onClick={()=>tableOp("deleteRow")}      title="Delete row" danger>Del Row</TBtn>
          <TDivider />
          <TBtn onClick={()=>tableOp("insertColLeft")}  title="Col left">Col ←</TBtn>
          <TBtn onClick={()=>tableOp("insertColRight")} title="Col right">Col →</TBtn>
          <TBtn onClick={()=>tableOp("deleteCol")}      title="Delete col" danger>Del Col</TBtn>
          <TDivider />
          <TBtn onClick={()=>tableOp("mergeCellRight")} title="Merge right">Merge →</TBtn>
          <TBtn onClick={()=>tableOp("splitCell")}      title="Split cell">Split</TBtn>
          <TDivider />
          <TBtn onClick={()=>setCellAlign("left")}  title="Align left">  <SVG size={11}><line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="10" x2="12" y2="10"/><line x1="3" y1="14" x2="15" y2="14"/></SVG></TBtn>
          <TBtn onClick={()=>setCellAlign("center")} title="Align center"><SVG size={11}><line x1="5" y1="6" x2="19" y2="6"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="5" y1="14" x2="19" y2="14"/></SVG></TBtn>
          <TBtn onClick={()=>setCellAlign("right")} title="Align right">  <SVG size={11}><line x1="9" y1="6" x2="21" y2="6"/><line x1="12" y1="10" x2="21" y2="10"/><line x1="9" y1="14" x2="21" y2="14"/></SVG></TBtn>
          <TDivider />
          <TBtn onClick={()=>setCellVAlign("top")}    title="Vertical top">↑T</TBtn>
          <TBtn onClick={()=>setCellVAlign("middle")} title="Vertical mid">↔M</TBtn>
          <TBtn onClick={()=>setCellVAlign("bottom")} title="Vertical bot">↓B</TBtn>
          <TDivider />
          <label title="Cell background" style={{display:"inline-flex",alignItems:"center",gap:"3px",cursor:"pointer",padding:"2px 5px",borderRadius:"4px",color:"#cbd5e1",fontSize:"10px",fontWeight:500}} onMouseEnter={e=>e.currentTarget.style.background="#334155"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            BG <input type="color" defaultValue="#ffffff" style={{width:0,height:0,opacity:0,position:"absolute"}} onChange={e=>setCellBg(e.target.value)}/>
          </label>
          <label title="Cell text color" style={{display:"inline-flex",alignItems:"center",gap:"3px",cursor:"pointer",padding:"2px 5px",borderRadius:"4px",color:"#cbd5e1",fontSize:"10px",fontWeight:500}} onMouseEnter={e=>e.currentTarget.style.background="#334155"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            Clr <input type="color" defaultValue="#1f2937" style={{width:0,height:0,opacity:0,position:"absolute"}} onChange={e=>setCellTextColor(e.target.value)}/>
          </label>
          <TDivider />
          <TBtn onClick={()=>tableOp("addHeaderRow")} active={tableCtx.hasHeader} title="Toggle header">Header</TBtn>
          <TBtn onClick={()=>tableOp("toggleStripe")} active={tableCtx.striped}   title="Toggle stripe">Stripe</TBtn>
          <TDivider />
          {TABLE_STYLES.map(s => <TBtn key={s.id} onClick={()=>applyTableStyleProp(s.id)} active={tableCtx.styleId===s.id} title={s.label}>{s.label}</TBtn>)}
          <TDivider />
          <TBtn onClick={()=>tableOp("deleteTable")} danger title="Delete table">
            <SVG size={11}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></SVG> Delete
          </TBtn>
        </div>
      )}

      {/* ── Image overlay ── */}
      {feat.media && selectedImg && overlayRect && (
        <div ref={overlayRef} style={{ position:"fixed", left:overlayRect.left, top:overlayRect.top, width:overlayRect.width, height:overlayRect.height, outline:"2px solid #3b82f6", pointerEvents:"none", zIndex:999, borderRadius:"4px" }}>
          <div style={{ position:"absolute", bottom:"calc(100% + 6px)", left:"50%", transform:"translateX(-50%)", background:"#1e293b", borderRadius:"8px", padding:"4px 6px", display:"flex", gap:"2px", alignItems:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.25)", whiteSpace:"nowrap", pointerEvents:"all", maxWidth:"90vw", overflowX:"auto" }}>
            <div draggable onDragStart={handleImgDragStart} title="Drag" style={{cursor:"grab",padding:"3px 5px",color:"#94a3b8",display:"flex",alignItems:"center",borderRight:"1px solid #334155",marginRight:"2px",paddingRight:"8px"}}>
              <SVG size={13}><circle cx="9" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/></SVG>
            </div>
            {IMG_ALIGNMENTS.map(a => (
              <button key={a.id} onMouseDown={e=>{e.preventDefault();setImgAlignment(a.id);}} title={a.title}
                style={{ padding:"3px 7px", borderRadius:"5px", border:"none", cursor:"pointer", fontSize:"10px", fontWeight:500, background:selectedImg.alignId===a.id?"#3b82f6":"transparent", color:selectedImg.alignId===a.id?"#fff":"#cbd5e1" }}
                onMouseEnter={e=>{if(selectedImg.alignId!==a.id)e.currentTarget.style.background="#334155";}}
                onMouseLeave={e=>{if(selectedImg.alignId!==a.id)e.currentTarget.style.background="transparent";}}>
                {a.label}
              </button>
            ))}
            <span style={{color:"#64748b",fontSize:"10px",marginLeft:"4px",borderLeft:"1px solid #334155",paddingLeft:"8px"}}>{Math.round(overlayRect.width)}×{Math.round(overlayRect.height)}</span>
          </div>
          {[
            {id:"nw",cursor:"nw-resize",style:{top:-5,left:-5}},{id:"n",cursor:"n-resize",style:{top:-5,left:"50%",transform:"translateX(-50%)"}},
            {id:"ne",cursor:"ne-resize",style:{top:-5,right:-5}},{id:"e",cursor:"e-resize",style:{top:"50%",right:-5,transform:"translateY(-50%)"}},
            {id:"se",cursor:"se-resize",style:{bottom:-5,right:-5}},{id:"s",cursor:"s-resize",style:{bottom:-5,left:"50%",transform:"translateX(-50%)"}},
            {id:"sw",cursor:"sw-resize",style:{bottom:-5,left:-5}},{id:"w",cursor:"w-resize",style:{top:"50%",left:-5,transform:"translateY(-50%)"}}
          ].map(h => <div key={h.id} onMouseDown={e=>startResize(e,h.id)} style={{position:"absolute",width:10,height:10,background:"#fff",border:"2px solid #3b82f6",borderRadius:"2px",cursor:h.cursor,pointerEvents:"all",...h.style}}/>)}
        </div>
      )}

      <style>{`
        [contenteditable]:empty:before{content:attr(data-placeholder);color:#9ca3af;pointer-events:none}
        [contenteditable] img{max-width:100%;border-radius:6px;cursor:pointer;vertical-align:middle}
        [contenteditable] img:hover{outline:1.5px dashed #93c5fd}
        [contenteditable] .img-float-wrap::after{content:"";display:table;clear:both}
        [contenteditable] table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}
        [contenteditable] td,[contenteditable] th{border:1px solid #d1d5db;padding:7px 12px;min-width:60px}
        [contenteditable] th{background:#f9fafb;font-weight:600}
        [contenteditable] a{color:#3b82f6;text-decoration:underline}
        [contenteditable] h1{font-size:2em;margin:.67em 0}[contenteditable] h2{font-size:1.5em;margin:.75em 0}
        [contenteditable] h3{font-size:1.17em;margin:.83em 0}[contenteditable] h4{font-size:1em;margin:1em 0}
        [contenteditable] blockquote{border-left:4px solid #3b82f6;margin:8px 0;padding:8px 16px;color:#4b5563;background:#f8fafc;border-radius:0 6px 6px 0}
        [contenteditable] pre{background:#f3f4f6;padding:12px 16px;border-radius:6px;font-family:monospace;font-size:0.93em;overflow-x:auto}
        #__drop_indicator__{animation:blink .6s ease infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        @media(max-width:600px){[contenteditable] img{max-width:100%!important;height:auto!important}}
      `}</style>

      <div style={{display:"flex",justifyContent:"flex-end",padding:"2px 8px 3px",borderTop:"1px solid #f3f4f6",background:"#fafafa",borderRadius:"0 0 10px 10px"}}>
        <span style={{fontSize:"8px",color:"#d1d5db",letterSpacing:"0.03em",userSelect:"none"}}>©<b>EE</b></span>
      </div>
    </div>
  );
}