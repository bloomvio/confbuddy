'use client'
import { useState, useEffect } from 'react'

interface LeadershipEntry {
  name: string
  role: string
  since?: string
  background?: string
  priorities?: string[]
}

interface NewsEntry {
  headline: string
  date?: string
  why_it_matters?: string
}

interface OpportunityEntry {
  title: string
  angle: string
}

interface Financials {
  revenue_estimate?: string
  arr_estimate?: string
  growth_rate?: string
  funding?: string
  valuation?: string
  gross_margin?: string
}

// New structured format from company-intel API
interface InternalBrief {
  account_status?: string
  temperature?: string
  arr?: string
  contract_value?: string
  products_in_use?: string[]
  account_owner?: string
  last_contact?: string
  renewal_date?: string
  outstanding_invoices?: number
  outstanding_amount?: string
  open_issues?: string[]
  health?: string
  crm_notes?: string
  relationship_history?: string | null
  doc_highlights?: string | null
}

interface PublicBrief {
  financials?: Financials
  leadership?: LeadershipEntry[]
  strategic_priorities?: string[]
  growth_signals?: string[]
  pain_points?: string[]
  tech_stack?: string[]
  recent_news?: NewsEntry[]
  competitive_context?: string
}

// Legacy format (for backward compat with cached intel)
interface LegacyAccount {
  status?: string
  temperature?: string
  arr?: string
  contract_value?: string
  products_in_use?: string[]
  account_owner?: string
  last_contact?: string
  renewal_date?: string
  outstanding_invoices?: number
  outstanding_amount?: string
  open_issues?: string[]
  health?: string
  notes?: string
}

export interface CompanyIntelData {
  snapshot?: string
  industry?: string
  hq?: string
  founded?: string
  size?: string
  public_or_private?: string
  // New structured format
  internal_brief?: InternalBrief
  public_brief?: PublicBrief
  // Legacy top-level fields (backward compat)
  financials?: Financials
  our_account?: LegacyAccount
  // Shared fields
  talking_points?: string[]
  opportunities?: OpportunityEntry[]
  risks?: string[]
}

interface Props {
  company: string
  contactId: string
  initialIntel?: CompanyIntelData | null
  autoFetch?: boolean
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function SectionHeader({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
        <span>{icon}</span> {label}
      </p>
      {sub && <span className="text-xs text-gray-300">·</span>}
      {sub && <span className="text-xs text-gray-400 normal-case font-normal">{sub}</span>}
    </div>
  )
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="text-sm text-gray-700 leading-snug flex gap-2">
      <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
      <span>{text}</span>
    </li>
  )
}

function Chip({ text, color = 'gray' }: { text: string; color?: 'gray' | 'indigo' | 'green' | 'amber' | 'red' | 'purple' }) {
  const cls = {
    gray:   'bg-gray-100 text-gray-600',
    indigo: 'bg-indigo-100 text-indigo-700',
    green:  'bg-green-100 text-green-700',
    amber:  'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-700',
  }[color]
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{text}</span>
}

function healthColor(h?: string): 'green' | 'amber' | 'red' | 'gray' {
  if (!h) return 'gray'
  const l = h.toLowerCase()
  if (l === 'green') return 'green'
  if (l === 'yellow' || l === 'amber' || l === 'orange') return 'amber'
  if (l === 'red') return 'red'
  return 'gray'
}

function tempColor(t?: string): 'red' | 'amber' | 'indigo' | 'gray' {
  if (!t) return 'gray'
  const l = t.toLowerCase()
  if (l === 'hot') return 'red'
  if (l === 'warm') return 'amber'
  if (l === 'cold') return 'indigo'
  return 'gray'
}

// ── Section label badge ───────────────────────────────────────────────────────

function SourceBadge({ type }: { type: 'internal' | 'public' }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
      type === 'internal'
        ? 'bg-indigo-100 text-indigo-600'
        : 'bg-gray-100 text-gray-500'
    }`}>
      {type === 'internal' ? '🏢 Internal' : '🌐 Public'}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CompanyIntel({ company, contactId, initialIntel, autoFetch = false }: Props) {
  const [intel, setIntel] = useState<CompanyIntelData | null>(initialIntel ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cached, setCached] = useState(!!initialIntel)

  // Auto-fetch on mount if no intel and autoFetch is set
  useEffect(() => {
    if (!initialIntel && autoFetch) {
      fetchIntel(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchIntel(forceRefresh = false) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/company-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, company, force_refresh: forceRefresh }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setIntel(data.intel)
      setCached(data.cached)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load intel')
    } finally {
      setLoading(false)
    }
  }

  // ── Empty / loading states ─────────────────────────────────────────────────
  if (!intel && !loading) {
    return (
      <div className="card text-center py-10 space-y-3">
        <div className="text-4xl">🔭</div>
        <h3 className="font-semibold text-gray-800">Sales Intelligence</h3>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Full brief on {company} — financials, leadership, pain points &amp; talking points.
        </p>
        <button onClick={() => fetchIntel(false)} className="btn-primary mx-auto">
          Generate Intel Brief
        </button>
        {error && (
          <div className="space-y-2">
            <p className="text-xs text-red-500">{error}</p>
            <button onClick={() => fetchIntel(false)} className="text-xs text-indigo-500 underline">
              Try again
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card text-center py-12 space-y-3">
        <div className="text-4xl animate-pulse">🔍</div>
        <p className="font-medium text-gray-700">Researching {company}...</p>
        <div className="space-y-1 text-sm text-gray-400">
          <p className="animate-pulse">⟳ Pulling CRM &amp; internal data</p>
          <p className="animate-pulse" style={{ animationDelay: '0.3s' }}>⟳ Analysing public financials &amp; news</p>
          <p className="animate-pulse" style={{ animationDelay: '0.6s' }}>⟳ Building talking points</p>
        </div>
      </div>
    )
  }

  if (!intel) return null

  // Normalise — handle both new structured format and legacy flat format
  const ib: InternalBrief | null =
    intel.internal_brief ??
    (intel.our_account ? {
      account_status:        intel.our_account.status,
      temperature:           intel.our_account.temperature,
      arr:                   intel.our_account.arr,
      contract_value:        intel.our_account.contract_value,
      products_in_use:       intel.our_account.products_in_use,
      account_owner:         intel.our_account.account_owner,
      last_contact:          intel.our_account.last_contact,
      renewal_date:          intel.our_account.renewal_date,
      outstanding_invoices:  intel.our_account.outstanding_invoices,
      outstanding_amount:    intel.our_account.outstanding_amount,
      open_issues:           intel.our_account.open_issues,
      health:                intel.our_account.health,
      crm_notes:             intel.our_account.notes,
    } : null)

  const pb: PublicBrief | null =
    intel.public_brief ??
    (intel.financials ? {
      financials:          intel.financials,
      leadership:          intel.leadership ?? undefined,
      strategic_priorities: intel.strategic_priorities ?? undefined,
      growth_signals:      intel.growth_signals ?? undefined,
      pain_points:         intel.pain_points ?? undefined,
      tech_stack:          intel.tech_stack ?? undefined,
      recent_news:         intel.recent_news ?? undefined,
      competitive_context: intel.competitive_context ?? undefined,
    } : null)

  const fin = pb?.financials

  return (
    <div className="space-y-3">

      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h2 className="font-bold text-base text-gray-900">{company}</h2>
            <p className="text-xs text-gray-500">{intel.industry} · {intel.hq} · {intel.size}</p>
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            {intel.public_or_private && (
              <Chip text={intel.public_or_private.split(' ')[0]} color="indigo" />
            )}
            {intel.founded && <Chip text={`Est. ${intel.founded}`} color="gray" />}
          </div>
        </div>
        {intel.snapshot && (
          <p className="text-sm text-gray-700 leading-snug">{intel.snapshot}</p>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* INTERNAL SECTION                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {ib && ib.account_status !== 'unknown' && (
        <div className={`card border-l-4 ${
          ib.health === 'green'                          ? 'border-l-green-400' :
          ib.health === 'red'                            ? 'border-l-red-400'   :
          ib.health === 'yellow' || ib.health === 'amber' ? 'border-l-amber-400' :
          'border-l-indigo-300'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="🏢" label="Account" />
            <SourceBadge type="internal" />
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            {ib.account_status && (
              <Chip
                text={ib.account_status}
                color={ib.account_status === 'customer' ? 'green' : ib.account_status === 'prospect' ? 'indigo' : 'gray'}
              />
            )}
            {ib.temperature && <Chip text={ib.temperature} color={tempColor(ib.temperature)} />}
            {ib.health && ib.health !== 'unknown' && <Chip text={`${ib.health} health`} color={healthColor(ib.health)} />}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-2">
            {ib.arr && (
              <div><span className="text-xs text-gray-400">ARR</span><p className="font-semibold text-gray-800">{ib.arr}</p></div>
            )}
            {ib.contract_value && (
              <div><span className="text-xs text-gray-400">Contract</span><p className="font-semibold text-gray-800">{ib.contract_value}</p></div>
            )}
            {ib.account_owner && (
              <div><span className="text-xs text-gray-400">Owner</span><p className="text-gray-700">{ib.account_owner}</p></div>
            )}
            {ib.last_contact && (
              <div><span className="text-xs text-gray-400">Last Touch</span><p className="text-gray-700">{ib.last_contact}</p></div>
            )}
            {ib.renewal_date && (
              <div><span className="text-xs text-gray-400">Renewal</span><p className="font-semibold text-amber-600">{ib.renewal_date}</p></div>
            )}
          </div>

          {ib.products_in_use && ib.products_in_use.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-400 mb-1">Products in use</p>
              <div className="flex flex-wrap gap-1">
                {ib.products_in_use.map(p => <Chip key={p} text={p} color="indigo" />)}
              </div>
            </div>
          )}

          {/* Outstanding invoices alert */}
          {ib.outstanding_invoices != null && ib.outstanding_invoices > 0 && (
            <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2 mb-2">
              <span>⚠️</span>
              <p className="text-xs text-red-600 font-medium">
                {ib.outstanding_invoices} outstanding invoice{ib.outstanding_invoices > 1 ? 's' : ''}
                {ib.outstanding_amount ? ` · ${ib.outstanding_amount}` : ''}
              </p>
            </div>
          )}

          {/* Open issues */}
          {ib.open_issues && ib.open_issues.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-400 mb-1">Open Issues</p>
              <ul className="space-y-0.5">
                {ib.open_issues.map((issue, i) => (
                  <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                    <span className="text-amber-500">!</span>{issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ib.crm_notes && (
            <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-2 mt-1">{ib.crm_notes}</p>
          )}
        </div>
      )}

      {/* Relationship history */}
      {ib?.relationship_history && (
        <div className="card border-l-4 border-l-indigo-200">
          <div className="flex items-center justify-between mb-2">
            <SectionHeader icon="🕐" label="Meeting History" />
            <SourceBadge type="internal" />
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{ib.relationship_history}</p>
        </div>
      )}

      {/* Doc highlights */}
      {ib?.doc_highlights && (
        <div className="card border-l-4 border-l-purple-200">
          <div className="flex items-center justify-between mb-2">
            <SectionHeader icon="📄" label="From Conference Docs" />
            <SourceBadge type="internal" />
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{ib.doc_highlights}</p>
        </div>
      )}

      {/* ── Talking Points ──────────────────────────────────────────────── */}
      {intel.talking_points && intel.talking_points.length > 0 && (
        <div className="card bg-indigo-50 border-indigo-100">
          <SectionHeader icon="🎯" label="Talking Points" />
          <ul className="space-y-1.5">
            {intel.talking_points.map((tp, i) => (
              <li key={i} className="text-sm text-indigo-800 leading-snug flex gap-2">
                <span className="font-bold text-indigo-400 flex-shrink-0">{i + 1}.</span>
                <span>{tp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Opportunities ───────────────────────────────────────────────── */}
      {intel.opportunities && intel.opportunities.length > 0 && (
        <div className="card">
          <SectionHeader icon="💡" label="Opportunities" />
          <div className="space-y-2">
            {intel.opportunities.map((o, i) => (
              <div key={i} className="border border-green-100 bg-green-50 rounded-xl px-3 py-2">
                <p className="text-sm font-semibold text-green-800">{o.title}</p>
                <p className="text-xs text-green-700 mt-0.5">{o.angle}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PUBLIC SECTION                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* ── Financials ──────────────────────────────────────────────────── */}
      {fin && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="💰" label="Financials" />
            <SourceBadge type="public" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {fin.revenue_estimate && (
              <div><p className="text-xs text-gray-400">Revenue</p><p className="font-semibold text-gray-800">{fin.revenue_estimate}</p></div>
            )}
            {fin.arr_estimate && (
              <div><p className="text-xs text-gray-400">ARR Est.</p><p className="font-semibold text-gray-800">{fin.arr_estimate}</p></div>
            )}
            {fin.growth_rate && (
              <div><p className="text-xs text-gray-400">Growth</p><p className="font-semibold text-green-700">{fin.growth_rate}</p></div>
            )}
            {fin.gross_margin && (
              <div><p className="text-xs text-gray-400">Margin</p><p className="font-semibold text-gray-800">{fin.gross_margin}</p></div>
            )}
            {fin.valuation && (
              <div><p className="text-xs text-gray-400">Valuation</p><p className="font-semibold text-gray-800">{fin.valuation}</p></div>
            )}
          </div>
          {fin.funding && (
            <p className="text-xs text-gray-500 mt-2 border-t border-gray-100 pt-2">
              🏦 {fin.funding}
            </p>
          )}
        </div>
      )}

      {/* ── Leadership ──────────────────────────────────────────────────── */}
      {pb?.leadership && pb.leadership.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="👔" label="Leadership" />
            <SourceBadge type="public" />
          </div>
          <div className="space-y-3">
            {pb.leadership.map((l, i) => (
              <div key={i}>
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-gray-900">{l.name}</span>
                  <span className="text-xs text-indigo-600 font-medium">{l.role}</span>
                  {l.since && <span className="text-xs text-gray-400">since {l.since}</span>}
                </div>
                {l.background && <p className="text-xs text-gray-500 mb-1">{l.background}</p>}
                {l.priorities && l.priorities.length > 0 && (
                  <ul className="space-y-0.5">
                    {l.priorities.map((p, j) => (
                      <li key={j} className="text-xs text-gray-600 flex gap-1.5">
                        <span className="text-indigo-400">▸</span>{p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Strategic Priorities ────────────────────────────────────────── */}
      {pb?.strategic_priorities && pb.strategic_priorities.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="🚀" label="Strategic Priorities" />
            <SourceBadge type="public" />
          </div>
          <ul className="space-y-1">
            {pb.strategic_priorities.map((p, i) => <Bullet key={i} text={p} />)}
          </ul>
        </div>
      )}

      {/* ── Growth Signals ──────────────────────────────────────────────── */}
      {pb?.growth_signals && pb.growth_signals.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="📈" label="Growth Signals" />
            <SourceBadge type="public" />
          </div>
          <ul className="space-y-1">
            {pb.growth_signals.map((s, i) => <Bullet key={i} text={s} />)}
          </ul>
        </div>
      )}

      {/* ── Pain Points ─────────────────────────────────────────────────── */}
      {pb?.pain_points && pb.pain_points.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="🩹" label="Pain Points" />
            <SourceBadge type="public" />
          </div>
          <ul className="space-y-1">
            {pb.pain_points.map((p, i) => <Bullet key={i} text={p} />)}
          </ul>
        </div>
      )}

      {/* ── Recent News ─────────────────────────────────────────────────── */}
      {pb?.recent_news && pb.recent_news.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="📰" label="Recent News" />
            <SourceBadge type="public" />
          </div>
          <div className="space-y-2">
            {pb.recent_news.map((n, i) => (
              <div key={i} className="border-l-2 border-gray-200 pl-3">
                <p className="text-sm text-gray-800 font-medium leading-snug">{n.headline}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {n.date && <span className="text-xs text-gray-400">{n.date}</span>}
                  {n.why_it_matters && <span className="text-xs text-indigo-600">{n.why_it_matters}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tech Stack ──────────────────────────────────────────────────── */}
      {pb?.tech_stack && pb.tech_stack.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="🖥️" label="Tech Stack" />
            <SourceBadge type="public" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pb.tech_stack.map(t => <Chip key={t} text={t} color="gray" />)}
          </div>
        </div>
      )}

      {/* ── Competitive Context ─────────────────────────────────────────── */}
      {pb?.competitive_context && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon="⚔️" label="Competitive Landscape" />
            <SourceBadge type="public" />
          </div>
          <p className="text-sm text-gray-700">{pb.competitive_context}</p>
        </div>
      )}

      {/* ── Risks ───────────────────────────────────────────────────────── */}
      {intel.risks && intel.risks.length > 0 && (
        <div className="card">
          <SectionHeader icon="⚠️" label="Watch Out For" />
          <ul className="space-y-1">
            {intel.risks.map((r, i) => (
              <li key={i} className="text-sm text-amber-700 flex gap-2">
                <span className="flex-shrink-0">▲</span><span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Footer / Refresh ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs text-gray-400">
          {cached ? '⚡ Cached brief' : '🤖 AI-generated brief'} · data may not be real-time
        </p>
        <button
          onClick={() => fetchIntel(true)}
          disabled={loading}
          className="text-xs text-indigo-500 font-medium hover:text-indigo-700 transition-colors"
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>
    </div>
  )
}
