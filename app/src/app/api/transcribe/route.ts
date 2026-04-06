import { NextRequest, NextResponse } from 'next/server'
import { AssemblyAI } from 'assemblyai'
import { createServiceClient } from '@/lib/supabase/server'

const assemblyai = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })

export async function POST(req: NextRequest) {
  const { meeting_id, recording_url } = await req.json()
  if (!meeting_id || !recording_url) {
    return NextResponse.json({ error: 'Missing meeting_id or recording_url' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  try {
    // Get signed URL from Supabase Storage
    const { data: signedUrlData } = await supabase.storage
      .from('confbuddy-recordings')
      .createSignedUrl(recording_url, 3600)

    if (!signedUrlData?.signedUrl) throw new Error('Could not generate signed URL')

    // Submit to AssemblyAI with speaker diarization
    const transcript = await assemblyai.transcripts.transcribe({
      audio: signedUrlData.signedUrl,
      speaker_labels: true,
      speakers_expected: 2,
    })

    if (transcript.status === 'error') throw new Error(transcript.error ?? 'Transcription failed')

    // Format speaker segments
    const speakers = transcript.utterances?.map(u => ({
      speaker: u.speaker,
      text: u.text,
      start: u.start,
      end: u.end,
    })) ?? []

    // Update meeting with transcript
    await supabase
      .from('cb_meetings')
      .update({
        transcript_raw: transcript.text,
        transcript_speakers: speakers,
        transcription_status: 'done',
        status: 'processing',
      })
      .eq('id', meeting_id)

    // Trigger note generation
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id }),
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    await supabase
      .from('cb_meetings')
      .update({ transcription_status: 'failed' })
      .eq('id', meeting_id)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Transcription failed' }, { status: 500 })
  }
}
