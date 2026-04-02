export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type CaptureMethod      = 'ocr' | 'qr' | 'manual'
export type CrmRelationship    = 'customer' | 'prospect' | 'partner' | 'unknown'
export type CrmTemperature     = 'hot' | 'warm' | 'cold' | 'unknown'
export type TranscriptionStatus = 'pending' | 'processing' | 'done' | 'failed'
export type MeetingStatus      = 'recording' | 'processing' | 'notes_ready' | 'exported'
export type MeetingOutcome     = 'hot' | 'follow_up' | 'not_interested' | 'intro_needed' | 'closed'
export type DocFileType        = 'attendee_list' | 'crm_export' | 'battlecard' | 'product_sheet' | 'competitor_intel' | 'other'
export type ConferenceMemberRole = 'owner' | 'member'

export interface Profile {
  id: string
  full_name: string | null
  company: string | null
  title: string | null
  email: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Conference {
  id: string
  user_id: string
  name: string
  location: string | null
  start_date: string | null
  end_date: string | null
  description: string | null
  is_active: boolean
  join_code: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: 'processing' | 'success' | 'error' | 'info'
  title: string
  body: string | null
  read: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface ConferenceMember {
  id: string
  conference_id: string
  user_id: string
  role: ConferenceMemberRole
  joined_at: string
}

export interface ConferenceDocument {
  id: string
  conference_id: string
  user_id: string
  filename: string
  file_type: DocFileType
  storage_path: string | null
  extracted_text: string | null
  row_count: number | null
  processed_at: string | null
  created_at: string
}

export interface ConferenceAttendee {
  id: string
  conference_id: string
  user_id: string
  full_name: string | null
  company: string | null
  title: string | null
  email: string | null
  phone: string | null
  crm_match_id: string | null
  sf_match_id: string | null
  contact_id: string | null
  is_target: boolean
  intel_cached: boolean
  source: string
  created_at: string
}

export interface Contact {
  id: string
  user_id: string
  conference_id: string | null
  full_name: string
  first_name: string | null
  last_name: string | null
  title: string | null
  company: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  capture_method: CaptureMethod
  badge_photo_url: string | null
  ocr_confidence: number | null
  enriched_at: string | null
  apollo_data: Json | null
  company_summary: string | null
  reporting_hierarchy: Json | null
  systems_landscape: Json | null
  crm_match_id: string | null
  crm_relationship: CrmRelationship
  crm_temperature: CrmTemperature
  crm_products_implemented: Json | null
  crm_notes: string | null
  created_at: string
  updated_at: string
}

export interface Meeting {
  id: string
  user_id: string
  contact_id: string | null
  conference_id: string | null
  title: string | null
  meeting_date: string
  location: string | null
  conference_name: string | null
  recording_url: string | null
  transcript_raw: string | null
  transcript_speakers: Json | null
  transcription_status: TranscriptionStatus
  assemblyai_job_id: string | null
  typed_notes: string | null
  status: MeetingStatus
  outcome: MeetingOutcome | null
  created_at: string
  updated_at: string
  contact?: Contact
}

export interface MeetingNotes {
  id: string
  meeting_id: string
  user_id: string
  bottom_line_summary: string | null
  intent: string | null
  raw_notes: string | null
  docx_url: string | null
  is_edited: boolean
  edited_at: string | null
  generated_at: string
  created_at: string
}

export interface ActionItem {
  id: string
  meeting_id: string
  user_id: string
  description: string
  owner: string | null
  due_date: string | null
  is_complete: boolean
  created_at: string
}

export interface UserIntegration {
  id: string
  user_id: string
  service_name: string
  auth_type: 'api_key' | 'oauth' | 'basic_auth'
  vault_secret_id: string | null
  display_label: string | null
  is_active: boolean
  last_synced_at: string | null
  created_at: string
}

export interface CrmData {
  id: string
  user_id: string
  source_file: string | null
  full_name: string | null
  company: string | null
  email: string | null
  phone: string | null
  relationship: string | null
  temperature: string | null
  products_implemented: Json | null
  account_owner: string | null
  last_contact_date: string | null
  notes: string | null
  raw_row: Json | null
  uploaded_at: string
}
