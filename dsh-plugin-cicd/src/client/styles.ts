export const STYLES = `
.cicd-root{
  --cicd-ink:#111827;
  --cicd-body:#374151;
  --cicd-muted:#6b7280;
  --cicd-faint:#9ca3af;
  --cicd-line:#e5e7eb;
  --cicd-soft:#f9fafb;
  --cicd-accent:#2563eb;
  --cicd-ok:#15803d;
  --cicd-warn:#a16207;
  --cicd-bad:#b91c1c;
  height:100%;min-height:0;background:#fff;color:var(--cicd-ink);
  font:14px/1.65 var(--dsw-font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif);
  color-scheme:light;
}
.cicd-root *{box-sizing:border-box}
.cicd-scroll{height:100%;overflow:auto;background:#fff}
.cicd-shell{max-width:1180px;margin:0 auto;padding:34px 40px 72px}

/* header */
.cicd-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap}
.cicd-brand{display:flex;align-items:center;gap:14px;min-width:300px}
.cicd-brand-mark{width:40px;height:40px;border:1px solid var(--cicd-line);border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.cicd-title{margin:0;font-size:26px;line-height:1.25;font-weight:650;letter-spacing:-.03em;color:var(--cicd-ink)}
.cicd-subtitle{margin:4px 0 0;font-size:14px;line-height:1.5;color:var(--cicd-muted);max-width:620px}
.cicd-header-actions{display:flex;align-items:center;gap:10px;padding-top:2px}

/* navigation */
.cicd-tabs{display:flex;align-items:center;gap:2px;margin:30px 0 0;border-bottom:1px solid var(--cicd-line);overflow:auto}
.cicd-tab{appearance:none;border:0;background:transparent;color:var(--cicd-muted);font:inherit;font-size:14px;font-weight:500;padding:11px 14px 12px;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:7px}
.cicd-tab:hover{color:var(--cicd-ink)}
.cicd-tab[data-active="true"]{color:var(--cicd-ink);border-bottom-color:var(--cicd-accent);font-weight:600}
.cicd-tab-count{font-size:12px;color:var(--cicd-faint);font-weight:500;font-variant-numeric:tabular-nums}
.cicd-tab[data-active="true"] .cicd-tab-count{color:var(--cicd-muted)}

/* compact summary */
.cicd-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 1px 0;font-size:13px;color:var(--cicd-muted)}
.cicd-summary b{font-size:14px;color:var(--cicd-ink);font-weight:650;font-variant-numeric:tabular-nums}
.cicd-summary-sep{color:#d1d5db}

/* generic surfaces */
.cicd-card{border:1px solid var(--cicd-line);border-radius:10px;background:#fff;min-width:0}
.cicd-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 18px 0}
.cicd-card-copy{min-width:0}
.cicd-card-title{margin:0;font-size:15px;font-weight:650;color:var(--cicd-ink);letter-spacing:-.01em}
.cicd-card-desc{margin:4px 0 0;font-size:13px;line-height:1.55;color:var(--cicd-muted)}
.cicd-card-extra{flex:none;display:flex;align-items:center;gap:8px}
.cicd-card-body{padding:16px 18px 18px}

/* buttons */
.cicd-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--cicd-line);border-radius:7px;background:#fff;color:var(--cicd-body);font:inherit;font-size:13px;font-weight:500;line-height:20px;padding:5px 12px;min-height:32px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,color .12s}
.cicd-btn:hover:not(:disabled){background:var(--cicd-soft);border-color:#d1d5db;color:var(--cicd-ink)}
.cicd-btn:focus-visible,.cicd-iconbtn:focus-visible,.cicd-tab:focus-visible,.cicd-stage-node:focus-visible{outline:2px solid var(--cicd-accent);outline-offset:2px}
.cicd-btn:disabled{opacity:.45;cursor:not-allowed}
.cicd-btn-primary{background:var(--cicd-ink);border-color:var(--cicd-ink);color:#fff}
.cicd-btn-primary:hover:not(:disabled){background:#1f2937;border-color:#1f2937;color:#fff}
.cicd-btn-ghost{background:transparent;border-color:transparent;color:var(--cicd-muted)}
.cicd-btn-ghost:hover:not(:disabled){background:var(--cicd-soft);border-color:var(--cicd-line);color:var(--cicd-ink)}
.cicd-btn-danger{background:#fff;border-color:#fecaca;color:var(--cicd-bad)}
.cicd-btn-danger:hover:not(:disabled){background:#fef2f2;border-color:var(--cicd-bad)}
.cicd-iconbtn{appearance:none;border:0;background:transparent;color:var(--cicd-faint);width:30px;height:30px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.cicd-iconbtn:hover:not(:disabled){background:var(--cicd-soft);color:var(--cicd-ink)}
.cicd-iconbtn:disabled{opacity:.4;cursor:not-allowed}

/* badges: color only where it carries meaning */
.cicd-badge{display:inline-flex;align-items:center;gap:6px;border-radius:5px;padding:0;font-size:12px;line-height:20px;font-weight:500;white-space:nowrap;max-width:100%;color:var(--cicd-muted)}
.cicd-badge-dot{width:5px;height:5px;border-radius:999px;background:currentColor;flex:none}
.cicd-badge-neutral,.cicd-badge-muted{color:var(--cicd-muted)}
.cicd-badge-info{color:var(--cicd-accent)}
.cicd-badge-success{color:var(--cicd-ok)}
.cicd-badge-warning{color:var(--cicd-warn)}
.cicd-badge-danger{color:var(--cicd-bad)}

/* notices */
.cicd-notice{display:flex;align-items:flex-start;gap:10px;border:1px solid var(--cicd-line);border-radius:8px;padding:12px 14px;margin:16px 0;background:var(--cicd-soft)}
.cicd-notice-info{background:var(--cicd-soft);border-color:var(--cicd-line)}
.cicd-notice-warning{background:#fffbeb;border-color:#fde68a}
.cicd-notice-danger{background:#fef2f2;border-color:#fecaca}
.cicd-notice-icon{color:var(--cicd-muted);padding-top:1px}
.cicd-notice-warning .cicd-notice-icon{color:var(--cicd-warn)}
.cicd-notice-danger .cicd-notice-icon{color:var(--cicd-bad)}
.cicd-notice-title{font-size:13px;font-weight:650;color:var(--cicd-ink);margin-bottom:2px}
.cicd-notice-text{font-size:13px;color:var(--cicd-muted);line-height:1.6}

/* table */
.cicd-list-area{display:flex;flex-direction:column;gap:6px;margin-top:2px}
.cicd-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:32px}
.cicd-table-wrap{border:1px solid var(--cicd-line);border-radius:9px;overflow:auto;background:#fff}
.cicd-table{width:100%;border-collapse:collapse;font-size:13px;min-width:880px}
.cicd-table th{text-align:left;font-size:12px;font-weight:500;color:var(--cicd-muted);background:var(--cicd-soft);padding:10px 14px;border-bottom:1px solid var(--cicd-line);white-space:nowrap;position:sticky;top:0;z-index:1}
.cicd-table td{padding:12px 14px;border-bottom:1px solid #f0f1f3;vertical-align:middle;color:var(--cicd-body)}
.cicd-table tr:last-child td{border-bottom:0}
.cicd-table tbody tr[data-clickable="true"]{cursor:pointer}
.cicd-table tbody tr[data-clickable="true"]:hover{background:#fafafa}
.cicd-cell-main{font-size:13px;font-weight:600;color:var(--cicd-ink);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cicd-cell-sub{font-size:12px;color:var(--cicd-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.cicd-cell-muted{color:var(--cicd-muted);white-space:nowrap;font-size:13px}
.cicd-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:12px}
.cicd-muted{color:var(--cicd-muted)}
.cicd-small{font-size:12px}
.cicd-inline{display:inline-flex;align-items:center;gap:6px}
.cicd-spacer{flex:1 1 auto}

/* stage map */
.cicd-stage-map-wrap{border-top:1px solid var(--cicd-line);padding-top:16px;margin-top:2px}
.cicd-stage-map{display:flex;align-items:stretch;gap:0;overflow-x:auto;padding:0 0 4px;scrollbar-width:thin}
.cicd-stage-cell{display:flex;align-items:center;flex:none}
.cicd-stage-node{appearance:none;border:1px solid var(--cicd-line);border-radius:8px;background:#fff;padding:12px 13px 11px;width:178px;min-height:122px;text-align:left;cursor:pointer;font:inherit;display:flex;flex-direction:column;gap:4px;transition:border-color .12s,box-shadow .12s}
.cicd-stage-node:hover{background:var(--cicd-soft)}
.cicd-stage-node[data-selected="true"]{border-color:var(--cicd-accent);box-shadow:0 0 0 3px rgba(37,99,235,.10)}
.cicd-stage-node[data-status="not_run"]{background:#fff}
.cicd-stage-node-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cicd-stage-index{font-size:11px;font-weight:500;color:var(--cicd-faint);letter-spacing:.04em}
.cicd-stage-status{font-size:12px;font-weight:500;color:var(--cicd-muted);white-space:nowrap}
.cicd-stage-node[data-status="running"] .cicd-stage-status{color:var(--cicd-accent)}
.cicd-stage-node[data-status="succeeded"] .cicd-stage-status{color:var(--cicd-ok)}
.cicd-stage-node[data-status="failed"] .cicd-stage-status{color:var(--cicd-bad)}
.cicd-stage-node[data-status="cancelled"] .cicd-stage-status{color:var(--cicd-warn)}
.cicd-stage-node[data-status="interrupted"] .cicd-stage-status{color:var(--cicd-warn)}
.cicd-stage-node[data-status="skipped"] .cicd-stage-status{color:var(--cicd-faint)}
.cicd-stage-name{font-size:14px;font-weight:650;color:var(--cicd-ink);line-height:1.35}
.cicd-stage-sub{font-size:12px;line-height:1.5;color:var(--cicd-muted);min-height:34px}
.cicd-stage-foot{font-size:11px;color:var(--cicd-faint);margin-top:auto;padding-top:6px;border-top:1px solid #f0f1f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cicd-connector{width:22px;color:#d1d5db;flex:none;display:block;margin:0 1px}
.cicd-report-strip{display:flex;align-items:center;gap:8px;width:100%;border:0;border-top:1px solid var(--cicd-line);background:transparent;color:var(--cicd-muted);margin-top:12px;padding:11px 2px 0;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.cicd-report-strip[data-selected="true"]{color:var(--cicd-accent)}
.cicd-report-label{font-weight:600;color:var(--cicd-body)}
.cicd-report-strip[data-selected="true"] .cicd-report-label{color:var(--cicd-accent)}

/* execution path (empty state) */
.cicd-path{border:1px solid var(--cicd-line);border-radius:9px;background:var(--cicd-soft);padding:16px 18px}
.cicd-path-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.cicd-path-label{font-size:12px;font-weight:600;color:var(--cicd-body)}
.cicd-path-hint{font-size:12px;color:var(--cicd-faint)}
.cicd-path-body{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
.cicd-path-cell{display:flex;align-items:center;gap:2px}
.cicd-path-item{display:inline-flex;align-items:center;gap:6px;color:var(--cicd-body);font-size:13px;white-space:nowrap}
.cicd-path-item svg{color:var(--cicd-faint)}
.cicd-path-arrow{color:#d1d5db;margin:0 5px}
.cicd-path-report{display:flex;align-items:center;gap:8px;border-top:1px solid var(--cicd-line);margin-top:12px;padding-top:10px;font-size:12px;color:var(--cicd-muted);flex-wrap:wrap}
.cicd-path-report svg{color:var(--cicd-faint)}
.cicd-path-report span:first-of-type{font-weight:600;color:var(--cicd-body)}

/* empty states */
.cicd-empty{padding:52px 24px 42px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.cicd-empty-icon{width:38px;height:38px;border-radius:9px;background:var(--cicd-soft);border:1px solid var(--cicd-line);display:flex;align-items:center;justify-content:center;color:var(--cicd-muted);margin-bottom:6px}
.cicd-empty-title{margin:0;font-size:20px;font-weight:650;color:var(--cicd-ink);letter-spacing:-.01em}
.cicd-empty-body{margin:0;max-width:520px;font-size:14px;line-height:1.65;color:var(--cicd-muted)}
.cicd-empty-action{margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
.cicd-empty-extra{width:100%;margin-top:14px;text-align:left}

/* detail */
.cicd-detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:18px;align-items:start}
.cicd-detail-main{min-width:0;display:flex;flex-direction:column;gap:16px}
.cicd-detail-side{min-width:0;display:flex;flex-direction:column;gap:16px;position:sticky;top:16px}
.cicd-kv{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #f0f1f3;font-size:13px}
.cicd-kv:last-child{border-bottom:0}
.cicd-kv-label{color:var(--cicd-muted);flex:none}
.cicd-kv-value{color:var(--cicd-ink);font-weight:500;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cicd-stage-inspector{border:1px solid var(--cicd-line);border-radius:10px;background:#fff}
.cicd-inspector-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--cicd-line)}
.cicd-inspector-icon{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:var(--cicd-soft);color:var(--cicd-muted);flex:none}
.cicd-inspector-title{font-size:15px;font-weight:650;color:var(--cicd-ink)}
.cicd-inspector-sub{font-size:12px;color:var(--cicd-muted);margin-top:1px}
.cicd-inspector-body{padding:16px 18px 18px}
.cicd-subhead{font-size:12px;font-weight:600;color:var(--cicd-body);margin:18px 0 8px}
.cicd-subhead:first-child{margin-top:0}
.cicd-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}
.cicd-list li{position:relative;padding-left:16px;font-size:13px;line-height:1.6;color:var(--cicd-muted)}
.cicd-list li:before{content:"";position:absolute;left:2px;top:8px;width:4px;height:4px;border-radius:999px;background:#d1d5db}
.cicd-evidence{display:flex;flex-wrap:wrap;gap:6px}
.cicd-chip{border:1px solid var(--cicd-line);background:var(--cicd-soft);border-radius:5px;padding:2px 7px;font-size:11px;color:var(--cicd-muted)}
.cicd-divider{height:1px;background:#f0f1f3;margin:16px 0}

/* run row */
.cicd-run-row{display:flex;align-items:center;gap:12px;width:100%;border:0;border-bottom:1px solid #f0f1f3;background:#fff;padding:11px 0;font:inherit;cursor:pointer;text-align:left}
.cicd-run-row:last-child{border-bottom:0}
.cicd-run-row:hover{background:var(--cicd-soft)}

/* forms */
.cicd-form{display:flex;flex-direction:column;gap:18px}
.cicd-form .cicd-section-stack{gap:0}
.cicd-form .cicd-card{border:0;border-top:1px solid var(--cicd-line);border-radius:0;background:transparent}
.cicd-form .cicd-section-stack > .cicd-card:first-child{border-top:0}
.cicd-form .cicd-card-head{padding:20px 0 0}
.cicd-form .cicd-card-body{padding:12px 0 26px}
.cicd-section-stack{display:flex;flex-direction:column;gap:16px}
.cicd-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 20px}
.cicd-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.cicd-field-wide{grid-column:1 / -1}
.cicd-field-label{font-size:13px;font-weight:600;color:var(--cicd-body)}
.cicd-field-control{display:block;min-width:0}
.cicd-field-hint{font-size:12px;color:var(--cicd-faint);line-height:1.5}
.cicd-field-error{font-size:12px;color:var(--cicd-bad);line-height:1.5}
.cicd-input{width:100%;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:var(--cicd-ink);font:inherit;font-size:14px;line-height:21px;padding:5px 9px;min-height:34px;outline:none}
.cicd-input:focus{border-color:var(--cicd-accent);box-shadow:0 0 0 3px rgba(37,99,235,.10)}
.cicd-input:disabled{background:var(--cicd-soft);color:var(--cicd-faint);cursor:not-allowed}
.cicd-input::placeholder{color:var(--cicd-faint)}
.cicd-textarea{resize:vertical;min-height:70px;line-height:1.6}
.cicd-select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,#6b7280 50%),linear-gradient(135deg,#6b7280 50%,transparent 50%);background-position:calc(100% - 14px) 14px,calc(100% - 10px) 14px;background-size:4px 4px,4px 4px;background-repeat:no-repeat;padding-right:30px}
.cicd-form-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:2px}

/* planning cards */
.cicd-placeholder-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.cicd-placeholder-card{border:1px solid var(--cicd-line);border-radius:10px;padding:18px;background:#fff;display:flex;flex-direction:column;gap:10px;min-height:180px}
.cicd-placeholder-head{display:flex;align-items:center;gap:9px}
.cicd-placeholder-icon{width:28px;height:28px;border-radius:6px;background:var(--cicd-soft);display:flex;align-items:center;justify-content:center;color:var(--cicd-muted);flex:none}
.cicd-placeholder-title{font-size:14px;font-weight:650;color:var(--cicd-ink)}
.cicd-placeholder-body{font-size:13px;line-height:1.65;color:var(--cicd-muted);margin:0}
.cicd-placeholder-foot{margin-top:auto;padding-top:10px;border-top:1px solid #f0f1f3;display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--cicd-faint);font-size:12px}

/* Git */
.cicd-git-summary{display:grid;grid-template-columns:2fr 1fr 1fr 1.4fr 1fr;gap:0;border:1px solid var(--cicd-line);border-radius:9px;background:#fff;overflow:hidden}
.cicd-git-summary>div{padding:11px 14px;border-right:1px solid #f0f1f3;min-width:0}
.cicd-git-summary>div:last-child{border-right:0}
.cicd-git-label{display:block;font-size:11px;color:var(--cicd-faint);white-space:nowrap;margin-bottom:2px}
.cicd-git-value{display:block;font-size:12px;color:var(--cicd-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cicd-git-grid{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:16px;align-items:start}
.cicd-git-compose{display:flex;flex-direction:column;gap:12px;min-width:0}
.cicd-git-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.cicd-file-list{border:1px solid var(--cicd-line);border-radius:8px;max-height:390px;overflow:auto}
.cicd-file-row{display:flex;align-items:center;gap:9px;padding:9px 11px;border-bottom:1px solid #f0f1f3;cursor:pointer;min-height:38px}
.cicd-file-row:last-child{border-bottom:0}
.cicd-file-row:hover,.cicd-file-row.is-active{background:var(--cicd-soft)}
.cicd-file-row.is-active{box-shadow:inset 2px 0 0 var(--cicd-accent)}
.cicd-check{width:14px;height:14px;accent-color:var(--cicd-accent);flex:none;margin:0}
.cicd-file-code{width:20px;flex:none;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--cicd-muted);text-align:center}
.cicd-file-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--cicd-body)}
.cicd-linkbtn{appearance:none;border:0;background:transparent;color:var(--cicd-accent);font:inherit;font-size:12px;cursor:pointer;padding:0}
.cicd-linkbtn:hover{text-decoration:underline}
.cicd-git-plan{border:1px solid #bfdbfe;background:#f8fbff;border-radius:8px;padding:13px 14px}
.cicd-git-plan-head{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--cicd-ink);margin-bottom:4px}
.cicd-git-plan p{margin:3px 0 6px}
.cicd-diff{margin:0;border:1px solid var(--cicd-line);border-radius:8px;background:var(--cicd-soft);color:var(--cicd-body);font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-height:420px;overflow:auto;padding:12px 14px;white-space:pre-wrap;word-break:break-word}
.cicd-git-success{display:flex;gap:12px;align-items:flex-start;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:9px;padding:16px 18px}
.cicd-git-success-icon{width:30px;height:30px;border-radius:50%;background:#dcfce7;color:var(--cicd-ok);display:flex;align-items:center;justify-content:center;flex:none}
.cicd-git-success-title{margin:0;font-size:16px;font-weight:650;color:var(--cicd-ink)}
.cicd-git-success-body{margin:3px 0 0;font-size:13px;color:var(--cicd-muted)}
.cicd-auth{border-top:1px solid var(--cicd-line);padding-top:12px}
.cicd-auth-summary{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--cicd-body);list-style:none}
.cicd-auth-summary::-webkit-details-marker{display:none}
.cicd-auth-summary svg{color:var(--cicd-muted)}
.cicd-auth-body{padding-top:10px;display:flex;flex-direction:column;gap:9px}
.cicd-auth-body p{margin:0}
.cicd-auth-input{display:flex;gap:8px;align-items:center}
.cicd-auth-input .cicd-input{flex:1 1 auto}
.cicd-workspace-list{display:flex;flex-direction:column;gap:6px;border:1px solid var(--cicd-line);border-radius:8px;padding:6px;max-height:190px;overflow:auto}
.cicd-workspace{display:flex;align-items:center;gap:8px;width:100%;border:1px solid transparent;border-radius:6px;background:#fff;padding:8px 10px;font:inherit;text-align:left;cursor:pointer;color:var(--cicd-body)}
.cicd-workspace:hover{background:var(--cicd-soft)}
.cicd-workspace.is-selected{border-color:var(--cicd-accent);background:#f8fbff}
.cicd-workspace svg{color:var(--cicd-muted);flex:none}
.cicd-workspace-title{font-size:13px;font-weight:600;color:var(--cicd-ink);white-space:nowrap}
.cicd-workspace-path{font-size:11px;color:var(--cicd-muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cicd-build-detection{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--cicd-line);padding-top:10px}
.cicd-build-candidates{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
.cicd-build-candidate{display:flex;flex-direction:column;gap:4px;border:1px solid var(--cicd-line);border-radius:8px;background:#fff;padding:10px 12px;text-align:left;font:inherit;cursor:pointer;color:var(--cicd-body)}
.cicd-build-candidate:hover{background:var(--cicd-soft)}
.cicd-build-candidate.is-selected{border-color:var(--cicd-accent);background:#f8fbff}
.cicd-build-candidate-title{font-size:13px;font-weight:600;color:var(--cicd-ink)}
.cicd-build-plan{border:1px solid var(--cicd-line);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px;background:#fcfcfd}
.cicd-build-plan-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.cicd-build-plan-title{font-size:13px;font-weight:600;color:var(--cicd-ink)}
.cicd-build-commands{display:flex;flex-direction:column;gap:4px}
.cicd-build-command{display:flex;align-items:baseline;gap:8px;font-size:12px}
.cicd-build-command-key{width:48px;flex:none;color:var(--cicd-muted);text-transform:uppercase;font-size:10px;letter-spacing:.06em}
.cicd-build-command code{min-width:0;overflow-wrap:anywhere;color:var(--cicd-body)}
.cicd-build-dockerfile summary{cursor:pointer;font-size:12px;color:var(--cicd-muted);padding:4px 0}
.cicd-build-dockerfile pre{margin:6px 0 0;max-height:320px}
.cicd-env-fold{border-top:1px solid var(--cicd-line);margin-top:8px;padding-top:4px}
.cicd-env-summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;padding:8px 0;font-size:13px;color:var(--cicd-body)}
.cicd-env-summary::-webkit-details-marker{display:none}
.cicd-env-summary svg{color:var(--cicd-muted)}
.cicd-env-name{font-weight:600;color:var(--cicd-ink);white-space:nowrap}
.cicd-env-body{padding:2px 0 6px;display:flex;flex-direction:column}
@media (max-width:1050px){.cicd-git-grid{grid-template-columns:minmax(0,1fr)}.cicd-git-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.cicd-git-summary>div{border-bottom:1px solid #f0f1f3}.cicd-git-summary>div:nth-child(2n){border-right:0}}
@media (max-width:760px){.cicd-git-summary{grid-template-columns:minmax(0,1fr)}.cicd-git-summary>div{border-right:0}}
/* logs / errors / loading */
.cicd-logbox{border:1px solid #1f2937;border-radius:7px;background:#0f172a;color:#e5e7eb;font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-height:360px;overflow:auto;padding:12px 14px;white-space:pre-wrap;word-break:break-word}
.cicd-logline{display:block}
.cicd-logline[data-stream="stderr"]{color:#fca5a5}
.cicd-logline[data-stream="system"]{color:#94a3b8}
.cicd-loading{display:flex;align-items:center;justify-content:center;gap:10px;min-height:240px;color:var(--cicd-muted);font-size:14px}
.cicd-spinner{width:15px;height:15px;border:2px solid var(--cicd-line);border-top-color:var(--cicd-accent);border-radius:50%;display:inline-block;animation:cicd-spin .8s linear infinite}
@keyframes cicd-spin{to{transform:rotate(360deg)}}
.cicd-error{border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:15px 16px;color:var(--cicd-bad);font-size:13px;display:flex;flex-direction:column;gap:10px}
.cicd-header-back{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--cicd-muted);font:inherit;font-size:13px;cursor:pointer;padding:0;margin-bottom:12px}
.cicd-header-back:hover{color:var(--cicd-ink)}
.cicd-risk-list{display:flex;flex-direction:column;gap:10px}
.cicd-risk{border-top:1px solid #f0f1f3;padding-top:10px}
.cicd-risk:first-child{border-top:0;padding-top:0}
.cicd-risk-title{font-size:13px;font-weight:600;color:var(--cicd-body);display:flex;align-items:center;gap:6px}
.cicd-risk-body{font-size:12px;color:var(--cicd-muted);margin-top:3px;line-height:1.6}

@media (max-width:1100px){
  .cicd-detail-grid{grid-template-columns:minmax(0,1fr)}
  .cicd-detail-side{position:static}
}
@media (max-width:760px){
  .cicd-shell{padding:24px 18px 56px}
  .cicd-header-actions{width:100%;justify-content:flex-start}
  .cicd-form-grid,.cicd-placeholder-grid{grid-template-columns:minmax(0,1fr)}
  .cicd-field-wide{grid-column:auto}
  .cicd-title{font-size:22px}
  .cicd-stage-node{width:168px}
  .cicd-path-body{gap:6px 2px}
}
`

