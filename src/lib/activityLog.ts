export async function logActivity(
  supabase: any,
  tableName: string,
  recordId: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  oldData?: any,
  newData?: any
) {
  const { error } = await supabase.from('activity_log').insert([{
    table_name: tableName,
    record_id: recordId,
    action,
    old_data: oldData ?? null,
    new_data: newData ?? null,
  }])
  if (error) console.error('activityLog error:', error)
}
