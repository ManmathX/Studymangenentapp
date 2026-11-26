import { useState } from 'react'
import { ROLES, users as usersApi } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useConfirm, useToast } from '../components/feedback.jsx'
import { EmptyState, ErrorState, LoadingState, PageHead } from '../components/ui.jsx'
import { formatDate, plural } from '../format.js'
import { useAction, useDebounced, useLoad } from '../hooks.js'

const PAGE_SIZE = 20

export function TeamPage() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('staff')
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())
  // "Staff" shows admins and editors; the API filters one role at a time.
  const list = useLoad(async () => {
    if (role !== 'staff') return usersApi.list({ q, role, page, limit: PAGE_SIZE, sort: 'email' })
    const [admins, editors] = await Promise.all([usersApi.list({ q, role: 'admin', limit: 100, sort: 'email' }), usersApi.list({ q, role: 'editor', limit: 100, sort: 'email' })])
    const items = [...admins.items, ...editors.items]
    return { items, meta: { page: 1, limit: items.length, total: items.length, hasNext: false } }
  }, [q, role, page])

  const change = useAction(async (account, next) => {
    const label = ROLES.find((item) => item.value === next)?.label
    const ok = await confirm({
      title: `Make ${account.name} ${next === 'admin' ? 'an' : 'a'} ${label.toLowerCase()}?`,
      message: `${ROLES.find((item) => item.value === next)?.hint} It applies the next time they sign in (within 15 minutes for open sessions).`,
      confirmLabel: `Make ${label.toLowerCase()}`,
      tone: next === 'student' ? 'danger' : 'primary',
    })
    if (!ok) return
    await usersApi.setRole(account.id, next)
    toast(`${account.name} is now ${next === 'admin' ? 'an' : 'a'} ${label.toLowerCase()}.`)
    list.reload()
  })

  const items = list.data?.items ?? []
  const meta = list.data?.meta
  return (
    <>
      <PageHead title="Team" lead="Who can use this portal. Editors manage exams and draft syllabi; admins also publish, delete and manage the team." />
      <div className="filters" role="search">
        <label className="field grow">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Name or email"
          />
        </label>
        <label className="field">
          <span>Show</span>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setPage(1)
            }}
          >
            <option value="staff">Admins and editors</option>
            {ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}s
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">To add someone, have them sign in to the app once (or create the account with <code>npm run create-admin</code>), then find them under Students and change their role.</p>
      <ErrorState error={list.error || change.error} onRetry={list.error ? list.reload : undefined} />
      {!list.data && list.loading ? <LoadingState /> : null}
      {list.data && !items.length ? <EmptyState title="Nobody here">{q ? `No account matches “${q}”.` : null}</EmptyState> : null}
      {items.length ? (
        <div className="card flush table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Last sign-in</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {items.map((account) => (
                <tr key={account.id}>
                  <td>
                    <strong>{account.name}</strong>
                    <div className="muted small">{account.email}</div>
                  </td>
                  <td className="small muted">{account.lastLoginAt ? formatDate(account.lastLoginAt) : 'Never'}</td>
                  <td>
                    <select value={account.role} disabled={account.id === user.id || change.busy} onChange={(e) => change.run(account, e.target.value)} aria-label={`Role of ${account.name}`} title={account.id === user.id ? 'Ask another admin to change your own role' : undefined}>
                      {ROLES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {meta && (meta.page > 1 || meta.hasNext) ? (
        <div className="pager">
          <button className="btn" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)}>
            Previous
          </button>
          <span className="muted small">
            Page {meta.page} · {plural(meta.total, 'account')}
          </span>
          <button className="btn" disabled={!meta.hasNext} onClick={() => setPage(meta.page + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </>
  )
}
