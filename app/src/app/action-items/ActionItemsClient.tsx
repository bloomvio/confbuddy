'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface MeetingContact { full_name: string; company?: string }
interface ActionMeeting  { id: string; meeting_date: string; contact?: MeetingContact }
interface ActionItem {
  id: string
  description: string
  owner?: string
  due_date?: string
  is_complete: boolean
  meeting?: ActionMeeting
}

interface Props {
  overdue:   ActionItem[]
  upcoming:  ActionItem[]
  noDueDate: ActionItem[]
  completed: ActionItem[]
}

export default function ActionItemsClient({ overdue, upcoming, noDueDate, completed }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [showCompleted, setShowCompleted] = useState(false)
  const supabase = createClient()

  async function toggleComplete(id: string, currentState: boolean) {
    const newState = !currentState
    setCompletedIds(prev => {
      const next = new Set(prev)
      newState ? next.add(id) : next.delete(id)
      return next
    })
    await supabase
      .from('cb_action_items')
      .update({ is_complete: newState, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  function isComplete(item: ActionItem) {
    return completedIds.has(item.id) ? true : item.is_complete
  }

  function Section({
    title, items, accent,
  }: { title: string; items: ActionItem[]; accent: string }) {
    if (items.length === 0) return null
    return (
      <div className="mb-5">
        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${accent}`}>{title}</p>
        <div className="space-y-2">
          {items.map(item => {
            const done = isComplete(item)
            const contact = item.meeting?.contact
            return (
              <div
                key={item.id}
                className={`card flex gap-3 transition-opacity ${done ? 'opacity-40' : ''}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleComplete(item.id, item.is_complete)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {done && <span className="text-white text-xs">✓</span>}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {item.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.owner && (
                      <span className="text-xs text-indigo-600">👤 {item.owner}</span>
                    )}
                    {item.due_date && (
                      <span className={`text-xs font-medium ${
                        item.due_date < new Date().toISOString().split('T')[0]
                          ? 'text-red-500' : 'text-gray-400'
                      }`}>
                        📅 {item.due_date}
                      </span>
                    )}
                    {contact && (
                      <Link
                        href={`/meetings/${item.meeting?.id}`}
                        className="text-xs text-gray-400 hover:text-indigo-500 transition-colors truncate"
                      >
                        🗓️ {contact.full_name}{contact.company ? ` · ${contact.company}` : ''}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const totalOpen = overdue.length + upcoming.length + noDueDate.length

  if (totalOpen === 0 && completed.length === 0) {
    return (
      <div className="card text-center py-16 space-y-2">
        <p className="text-4xl">🎉</p>
        <p className="font-semibold text-gray-800">All clear!</p>
        <p className="text-sm text-gray-400">No open action items. Go crush some meetings.</p>
        <Link href="/meetings/new" className="btn-primary inline-block mt-2">Record a Meeting</Link>
      </div>
    )
  }

  return (
    <div>
      <Section title={`⚠️ Overdue (${overdue.length})`}  items={overdue}   accent="text-red-500" />
      <Section title={`📅 Upcoming (${upcoming.length})`} items={upcoming}  accent="text-amber-600" />
      <Section title={`📋 No due date (${noDueDate.length})`} items={noDueDate} accent="text-gray-500" />

      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(v => !v)}
            className="text-xs text-gray-400 font-medium hover:text-gray-600 transition-colors mb-2"
          >
            {showCompleted ? '▾ Hide' : '▸ Show'} completed ({completed.length})
          </button>
          {showCompleted && (
            <Section title="✅ Completed" items={completed} accent="text-green-600" />
          )}
        </div>
      )}
    </div>
  )
}
