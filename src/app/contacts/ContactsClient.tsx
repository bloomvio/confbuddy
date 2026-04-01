'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

interface Contact {
  id: string
  full_name: string
  title?: string
  company?: string
  email?: string
  crm_relationship?: string
  crm_temperature?: string
  pipeline_stage?: string
  deal_size?: number
  event_name?: string
}

type Filter = 'all' | 'customer' | 'prospect' | 'hot' | 'pipeline'

const PIPELINE_LABEL: Record<string, string> = {
  prospect:    'Prospect',
  qualified:   'Qualified',
  proposal:    'Proposal',
  negotiation: 'Negotiation',
  closed_won:  'Won',
  closed_lost: 'Lost',
}
const PIPELINE_COLOR: Record<string, string> = {
  prospect:    'bg-gray-100 text-gray-600',
  qualified:   'bg-blue-100 text-blue-700',
  proposal:    'bg-indigo-100 text-indigo-700',
  negotiation: 'bg-amber-100 text-amber-700',
  closed_won:  'bg-green-100 text-green-700',
  closed_lost: 'bg-red-100 text-red-600',
}

export default function ContactsClient({ contacts }: { contacts: Contact[] }) {
  const [query,  setQuery]  = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return contacts.filter(c => {
      // Text search
      if (q) {
        const hay = `${c.full_name} ${c.company ?? ''} ${c.title ?? ''} ${c.email ?? ''} ${c.event_name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      // Filter tab
      if (filter === 'customer')  return c.crm_relationship === 'customer'
      if (filter === 'prospect')  return c.crm_relationship === 'prospect'
      if (filter === 'hot')       return c.crm_temperature  === 'hot'
      if (filter === 'pipeline')  return !!c.pipeline_stage && c.pipeline_stage !== 'closed_won' && c.pipeline_stage !== 'closed_lost'
      return true
    })
  }, [contacts, query, filter])

  const counts = useMemo(() => ({
    all:       contacts.length,
    customer:  contacts.filter(c => c.crm_relationship === 'customer').length,
    prospect:  contacts.filter(c => c.crm_relationship === 'prospect').length,
    hot:       contacts.filter(c => c.crm_temperature  === 'hot').length,
    pipeline:  contacts.filter(c => !!c.pipeline_stage && c.pipeline_stage !== 'closed_won' && c.pipeline_stage !== 'closed_lost').length,
  }), [contacts])

  const filters: { key: Filter; label: string }[] = [
    { key: 'all',      label: `All (${counts.all})`          },
    { key: 'customer', label: `Customers (${counts.customer})` },
    { key: 'prospect', label: `Prospects (${counts.prospect})` },
    { key: 'hot',      label: `🔥 Hot (${counts.hot})`       },
    { key: 'pipeline', label: `💼 Pipeline (${counts.pipeline})` },
  ]

  return (
    <div className="flex flex-col overflow-hidden flex-1">
      {/* Search */}
      <div className="px-4 pt-3 pb-2 bg-white border-b border-gray-100 flex-shrink-0">
        <input
          type="search"
          className="input w-full text-sm"
          placeholder="Search by name, company, event…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Filter chips */}
      <div className="px-4 py-2 bg-white border-b border-gray-100 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-w-lg mx-auto w-full">
        {contacts.length === 0 && (
          <div className="card text-center py-12 mt-4">
            <div className="text-4xl mb-3">👤</div>
            <p className="font-medium text-gray-700">No contacts yet</p>
            <p className="text-sm text-gray-400 mt-1">Scan a badge to add your first contact</p>
            <Link href="/contacts/scan" className="btn-primary inline-block mt-4 text-sm py-2 px-6">
              📷 Scan Badge
            </Link>
          </div>
        )}

        {contacts.length > 0 && filtered.length === 0 && (
          <div className="card text-center py-10 mt-2">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-sm text-gray-500">No contacts match <strong>{query}</strong></p>
            <button onClick={() => { setQuery(''); setFilter('all') }}
              className="text-xs text-indigo-500 mt-2 hover:underline">Clear search</button>
          </div>
        )}

        {filtered.map(c => (
          <Link key={c.id} href={`/contacts/${c.id}`}
            className="card flex items-center gap-3 hover:border-indigo-200 transition-colors">

            {/* Avatar */}
            <div className="w-11 h-11 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold flex-shrink-0 text-lg">
              {c.full_name[0]}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900">{c.full_name}</p>
              <p className="text-xs text-gray-500 truncate">
                {[c.title, c.company].filter(Boolean).join(' · ')}
              </p>
              {c.event_name && (
                <p className="text-xs text-indigo-400 truncate">📍 {c.event_name}</p>
              )}
            </div>

            {/* Badges */}
            <div className="flex flex-col gap-1 items-end flex-shrink-0">
              {/* CRM relationship + temperature */}
              <div className="flex gap-1">
                {c.crm_relationship && c.crm_relationship !== 'unknown' && (
                  <span className={`badge-${c.crm_relationship}`}>{c.crm_relationship}</span>
                )}
                {c.crm_temperature && c.crm_temperature !== 'unknown' && (
                  <span className={`badge-${c.crm_temperature}`}>{c.crm_temperature}</span>
                )}
              </div>
              {/* Pipeline stage + deal size */}
              {c.pipeline_stage && (
                <div className="flex items-center gap-1">
                  {c.deal_size && (
                    <span className="text-xs font-semibold text-gray-700">
                      ${(c.deal_size / 1000).toFixed(0)}K
                    </span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PIPELINE_COLOR[c.pipeline_stage] ?? 'bg-gray-100 text-gray-600'}`}>
                    {PIPELINE_LABEL[c.pipeline_stage] ?? c.pipeline_stage}
                  </span>
                </div>
              )}
            </div>
          </Link>
        ))}

        {/* Bottom padding so last item isn't hidden behind mobile nav */}
        <div className="h-4" />
      </div>
    </div>
  )
}
