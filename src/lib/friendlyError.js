// Turns Supabase/Postgres errors into plain-language messages a non-technical
// user can act on — especially Row-Level Security (permission) rejections, which
// otherwise surface as "new row violates row-level security policy for table …".
//
// Pass the current `profile` (from useAuth) and the module tag the action needs
// ('Sales' | 'Stocks' | 'Expense' | 'Inventory') so the message can name exactly
// what's missing.
export function friendlyError(err, { profile, module } = {}) {
  if (!err) return ''
  const msg = err.message || String(err)
  const isRls = err.code === '42501' || /row-level security/i.test(msg)
  if (!isRls) return msg

  const who = profile?.name || profile?.email || 'Your account'

  if (profile && !profile.is_admin) {
    if (!profile.location) {
      return `${who} has no branch assigned, so this can't be saved. Ask an admin to set your branch under Settings → Users.`
    }
    if (module && !(profile.tags || []).includes(module)) {
      return `${who} doesn't have the "${module}" permission needed to do this. Ask an admin to enable it under Settings → Users.`
    }
  }

  return `${who} doesn't have permission to save this${module ? ` (${module})` : ''}. Ask an admin to check your access — branch and module permissions — under Settings → Users.`
}
