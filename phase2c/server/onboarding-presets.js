// The 8 presets offered during onboarding and available in the CreateSpaceModal.
//
// Deploy 1 uses only: preset (id), name, icon, color.
// Deploy 2 will read `default_fields` from here to populate per-preset custom
// field schemas. We define them now so Deploy 2 doesn't have to touch this
// file's structure, only the field type implementations.

const PRESETS = [
  {
    preset: 'personal',
    name: 'Personal',
    icon: 'house',
    color: '#3B82F6', // blue
    description: 'Life admin. The catch-all for everything personal.',
    default_fields: [],
  },
  {
    preset: 'legal',
    name: 'Legal',
    icon: 'scale',
    color: '#EC4899', // pink
    description: 'Cases, clients, court dates, matters.',
    default_fields: [
      { key: 'case_reference', label: 'Case reference', type: 'text' },
      { key: 'client_name',    label: 'Client name',    type: 'text', client_identifier: true },
      {
        key: 'matter_type',    label: 'Matter type',    type: 'dropdown',
        options: ['Litigation', 'Corporate', 'Family', 'Property', 'Criminal', 'Immigration', 'Other'],
      },
      { key: 'court_tribunal', label: 'Court/tribunal', type: 'text' },
      { key: 'next_hearing',   label: 'Next hearing',   type: 'date' },
      { key: 'opposing_counsel', label: 'Opposing counsel', type: 'text' },
      {
        key: 'fee_arrangement', label: 'Fee arrangement', type: 'dropdown',
        options: ['Hourly', 'Fixed fee', 'Conditional', 'Legal aid', 'Pro bono'],
      },
    ],
  },
  {
    preset: 'medical',
    name: 'Medical',
    icon: 'stethoscope',
    color: '#10B981', // green
    description: 'Patients, appointments, and clinical workflow.',
    default_fields: [
      { key: 'patient_identifier', label: 'Patient identifier', type: 'text', client_identifier: true },
      { key: 'presenting_complaint', label: 'Presenting complaint', type: 'text' },
      {
        key: 'specialty', label: 'Specialty area', type: 'dropdown',
        options: ['General practice', 'Surgery', 'Physiotherapy', 'Mental health', 'Paediatrics', 'Cardiology', 'Dermatology', 'Other'],
      },
      {
        key: 'appointment_type', label: 'Appointment type', type: 'dropdown',
        options: ['Initial consultation', 'Follow-up', 'Procedure', 'Assessment', 'Review', 'Other'],
      },
      { key: 'last_seen', label: 'Last seen', type: 'date' },
      { key: 'next_appointment', label: 'Next appointment', type: 'date' },
      {
        key: 'status', label: 'Status', type: 'dropdown',
        options: ['Active', 'Discharged', 'On hold', 'Referred out'],
      },
    ],
  },
  {
    preset: 'engineering',
    name: 'Engineering',
    icon: 'wrench',
    color: '#F97316', // orange
    description: 'Projects across all engineering disciplines.',
    default_fields: [
      { key: 'project_code', label: 'Project code', type: 'text' },
      {
        key: 'discipline', label: 'Discipline', type: 'dropdown',
        options: ['Software', 'Civil', 'Electrical', 'Mechanical', 'Chemical', 'Aerospace', 'Other'],
      },
      {
        key: 'phase', label: 'Phase', type: 'dropdown',
        options: ['Concept', 'Design', 'Development', 'Testing', 'Deployment', 'Maintenance'],
      },
      {
        key: 'risk_level', label: 'Risk level', type: 'dropdown',
        options: ['Low', 'Medium', 'High', 'Critical'],
      },
      { key: 'lead_engineer', label: 'Lead engineer', type: 'text' },
      { key: 'stakeholder', label: 'Client/stakeholder', type: 'text', client_identifier: true },
      { key: 'target_completion', label: 'Target completion', type: 'date' },
    ],
  },
  {
    preset: 'teaching',
    name: 'Teaching',
    icon: 'book',
    color: '#8B5CF6', // purple
    description: 'Students, classes, and lessons.',
    default_fields: [
      {
        key: 'context', label: 'Context', type: 'dropdown',
        options: ['Tutoring', 'Primary school', 'Secondary school', 'College', 'University', 'Other'],
      },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'student_or_class', label: 'Student/class name', type: 'text', client_identifier: true },
      { key: 'level', label: 'Level/year group', type: 'text' },
      { key: 'next_session', label: 'Next session', type: 'date' },
      {
        key: 'session_type', label: 'Session type', type: 'dropdown',
        options: ['Lesson', 'Tutorial', 'Assessment', 'Exam', 'Meeting'],
      },
      { key: 'share_with_student', label: 'Notes visible to student', type: 'checkbox' },
    ],
  },
  {
    preset: 'freelance',
    name: 'Freelance',
    icon: 'briefcase',
    color: '#14B8A6', // teal
    description: 'Clients, projects, and invoicing.',
    default_fields: [
      { key: 'client_name', label: 'Client name', type: 'text', client_identifier: true },
      { key: 'project_type', label: 'Project type', type: 'text' },
      {
        key: 'engagement_model', label: 'Engagement model', type: 'dropdown',
        options: ['Hourly', 'Fixed fee', 'Retainer', 'Day rate', 'Project-based'],
      },
      { key: 'rate', label: 'Rate', type: 'number' },
      { key: 'started', label: 'Started', type: 'date' },
      { key: 'target_delivery', label: 'Target delivery', type: 'date' },
      {
        key: 'invoice_status', label: 'Invoice status', type: 'dropdown',
        options: ['Not invoiced', 'Invoiced', 'Part-paid', 'Paid', 'Overdue'],
      },
    ],
  },
  {
    preset: 'breeding',
    name: 'Breeding',
    icon: 'leaf',
    color: '#84CC16', // lime
    description: 'Lines, specimens, and lineage tracking.',
    default_fields: [
      {
        key: 'specimen_type', label: 'Specimen type', type: 'dropdown',
        options: ['Dog', 'Cat', 'Horse', 'Bird', 'Fish', 'Plant', 'Other'],
      },
      { key: 'line', label: 'Line/lineage', type: 'text' },
      { key: 'identifier', label: 'Identifier', type: 'text', client_identifier: true },
      { key: 'parent_a', label: 'Parent A', type: 'text' },
      { key: 'parent_b', label: 'Parent B', type: 'text' },
      { key: 'birth_date', label: 'Birth/germination date', type: 'date' },
      {
        key: 'status', label: 'Status', type: 'dropdown',
        options: ['Active', 'Sold', 'Retired', 'Lost', 'Archived'],
      },
      { key: 'condition_notes', label: 'Health/condition notes', type: 'text' },
    ],
  },
  {
    preset: 'custom',
    name: 'Custom',
    icon: 'sparkles',
    color: '#64748B', // slate
    description: 'Build your own space from scratch.',
    default_fields: [],
  },
];

// The 30-icon set available for space icons (Lucide icon names).
const ICON_SET = [
  'briefcase', 'scale', 'stethoscope', 'wrench', 'book', 'graduation-cap', 'gavel', 'clipboard-list',
  'house', 'heart', 'users', 'baby', 'shopping-cart', 'plane',
  'dumbbell', 'activity', 'pill', 'leaf',
  'sparkles', 'palette', 'camera', 'music', 'gamepad-2',
  'wallet', 'receipt', 'chart-line', 'folder',
  'code', 'server', 'cpu',
];

// The 8-colour palette.
const COLOR_SET = [
  '#3B82F6', // blue
  '#EC4899', // pink
  '#10B981', // green
  '#F97316', // orange
  '#8B5CF6', // purple
  '#14B8A6', // teal
  '#84CC16', // lime
  '#64748B', // slate
];

function getPreset(id) {
  return PRESETS.find(p => p.preset === id) || null;
}

module.exports = { PRESETS, ICON_SET, COLOR_SET, getPreset };
