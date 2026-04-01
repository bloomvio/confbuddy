import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  LevelFormat, Header, Footer, PageNumber, ExternalHyperlink,
} from 'docx'

// ── Exact colours extracted from the HighRadians MoM template ─────────────
const C = {
  title:    '393939',   // document title
  orange:   'FC7500',   // Heading 2 (section headers) — HighRadians brand
  darkGray: '434343',   // Heading 3
  body:     '333333',
  muted:    '666666',
  tableHdr: 'FC7500',   // action items header row
  tableHdrFg: 'FFFFFF',
  tableAlt: 'FFF4EB',   // light orange stripe
  border:   'E0E0E0',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function h2(text: string) {
  return new Paragraph({
    spacing: { before: 300, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.orange, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 28, color: C.orange, font: 'Calibri' })],
  })
}

function h3(text: string) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: C.darkGray, font: 'Calibri' })],
  })
}

function bodyText(text: string, opts: { muted?: boolean; bold?: boolean } = {}) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [new TextRun({
      text,
      size: 22,
      color: opts.muted ? C.muted : C.body,
      bold: opts.bold,
      font: 'Calibri',
    })],
  })
}

function bulletPoint(text: string) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text: text.replace(/^[•\-\*]\s*/, ''), size: 22, color: C.body, font: 'Calibri' })],
  })
}

function spacer() {
  return new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun('')] })
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: C.border }
const borders    = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }

export async function POST(req: NextRequest) {
  const { meeting_id } = await req.json()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: meeting }, { data: notes }, { data: actionItems }] = await Promise.all([
    supabase.from('cb_meetings').select('*, contact:cb_contacts(*)').eq('id', meeting_id).single(),
    supabase.from('cb_meeting_notes').select('*').eq('meeting_id', meeting_id).single(),
    supabase.from('cb_action_items').select('*').eq('meeting_id', meeting_id).order('created_at'),
  ])

  if (!meeting || !notes) {
    return NextResponse.json({ error: 'Meeting or notes not found' }, { status: 404 })
  }

  const contact = meeting.contact as Record<string, string> | null
  const meetingDate = new Date(meeting.meeting_date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── Summary bullets ───────────────────────────────────────────────────────
  const summaryLines = (notes.bottom_line_summary ?? '')
    .split('\n')
    .map((l: string) => l.trim())
    .filter(Boolean)

  // ── Raw notes paragraphs ──────────────────────────────────────────────────
  const rawLines = (notes.raw_notes ?? '')
    .split('\n')
    .map((l: string) => l.trim())

  // ── Action items table ────────────────────────────────────────────────────
  const items = actionItems ?? []

  function makeCell(text: string, widthDxa: number, isHeader = false) {
    return new TableCell({
      borders,
      width: { size: widthDxa, type: WidthType.DXA },
      shading: isHeader
        ? { fill: C.tableHdr, type: ShadingType.CLEAR }
        : undefined,
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
      children: [new Paragraph({
        children: [new TextRun({
          text,
          size: 20,
          bold: isHeader,
          color: isHeader ? C.tableHdrFg : C.body,
          font: 'Calibri',
        })],
      })],
    })
  }

  const actionTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [5000, 2180, 2180],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          makeCell('Action Item', 5000, true),
          makeCell('Owner',       2180, true),
          makeCell('Due Date',    2180, true),
        ],
      }),
      ...(items.length > 0
        ? items.map((a, i) =>
            new TableRow({
              children: [
                new TableCell({
                  borders,
                  width: { size: 5000, type: WidthType.DXA },
                  shading: i % 2 === 1 ? { fill: C.tableAlt, type: ShadingType.CLEAR } : undefined,
                  margins: { top: 100, bottom: 100, left: 140, right: 140 },
                  children: [new Paragraph({
                    children: [new TextRun({ text: a.description ?? '', size: 20, color: C.body, font: 'Calibri' })],
                  })],
                }),
                makeCell(a.owner   ?? '—', 2180),
                makeCell(a.due_date ?? '—', 2180),
              ],
            })
          )
        : [new TableRow({
            children: [
              makeCell('No action items recorded', 5000),
              makeCell('—', 2180),
              makeCell('—', 2180),
            ],
          })]),
    ],
  })

  // ── Document ───────────────────────────────────────────────────────────────
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },

    styles: {
      default: { document: { run: { font: 'Calibri', size: 22, color: C.body } } },
    },

    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },

      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.orange, space: 4 } },
            spacing: { after: 200 },
            children: [
              new TextRun({ text: 'HighRadians  ·  Minutes of Meeting', size: 18, color: C.muted, font: 'Calibri' }),
              new TextRun({ text: '\t', font: 'Calibri' }),
              new TextRun({ text: meetingDate, size: 18, color: C.muted, font: 'Calibri' }),
            ],
            tabStops: [{ type: 'right' as unknown as import('docx').TabStopType, position: 9360 }],
          })],
        }),
      },

      footers: {
        default: new Footer({
          children: [new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: C.orange, space: 4 } },
            alignment: AlignmentType.RIGHT,
            spacing: { before: 200 },
            children: [
              new TextRun({ text: 'Confidential  ·  Page ', size: 18, color: C.muted, font: 'Calibri' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: C.muted, font: 'Calibri' }),
            ],
          })],
        }),
      },

      children: [

        // ── Title ────────────────────────────────────────────────────────────
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: [
            new TextRun({ text: 'Minutes of Meeting (MoM)', bold: true, size: 52, color: C.title, font: 'Calibri' }),
          ],
        }),
        new Paragraph({
          spacing: { before: 0, after: 400 },
          children: [
            new TextRun({
              text: `${contact?.company ?? 'Unknown Company'}  ·  ${meetingDate}`,
              size: 24, color: C.muted, font: 'Calibri',
            }),
          ],
        }),

        // ── Date of Meeting ──────────────────────────────────────────────────
        h2('Date of Meeting'),
        bodyText(meetingDate, { bold: true }),
        spacer(),

        // ── Attendees ─────────────────────────────────────────────────────────
        h2('Attendees'),
        h3('HighRadians'),
        bodyText('HighRadians Representative'),
        h3('Non-HighRadians'),
        ...(contact
          ? [
              bodyText(`${contact.full_name ?? ''}${contact.title ? ' — ' + contact.title : ''}`, { bold: true }),
              bodyText(`${contact.company ?? ''}${contact.email ? '  ·  ' + contact.email : ''}`, { muted: true }),
            ]
          : [bodyText('Contact not specified', { muted: true })]),
        spacer(),

        // ── Bottom-Line Summary ───────────────────────────────────────────────
        h2('Bottom-Line Summary'),
        ...(summaryLines.length > 0
          ? summaryLines.map(bulletPoint)
          : [bodyText('No summary generated yet.', { muted: true })]),
        spacer(),

        // ── Meeting Intent ─────────────────────────────────────────────────
        h2('Meeting Intent'),
        bodyText(notes.intent ?? 'Not specified'),
        spacer(),

        // ── Action Items ──────────────────────────────────────────────────────
        h2('Action Items'),
        actionTable,
        spacer(),

        // ── Raw Notes ─────────────────────────────────────────────────────────
        h2('Raw Notes'),
        ...(rawLines.length > 0 && rawLines.some(l => l)
          ? rawLines.map(line => line ? bodyText(line) : spacer())
          : [bodyText('No raw notes captured.', { muted: true })]),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const safeContactName = (contact?.full_name ?? 'Meeting').replace(/[^a-zA-Z0-9 ]/g, '').trim()
  const safeDateStr = new Date(meeting.meeting_date)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .replace(/,/g, '').replace(/ /g, '_')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="MoM_${safeContactName}_${safeDateStr}.docx"`,
    },
  })
}
