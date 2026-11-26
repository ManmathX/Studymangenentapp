import { useState } from 'react'
import { Link } from 'react-router-dom'
import { categories as categoriesApi } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Dialog, useConfirm, useToast } from '../components/feedback.jsx'
import { SortableList } from '../components/Sortable.jsx'
import { Badge, EmptyState, ErrorState, ErrorText, Field, Icon, LoadingState, PageHead, Toggle } from '../components/ui.jsx'
import { plural } from '../format.js'
import { useAction, useLoad } from '../hooks.js'

const GROUPS = [
  { value: 'exam', label: 'Competitive or entrance exams' },
  { value: 'board', label: 'School boards' },
]

export function CategoriesPage() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const list = useLoad(categoriesApi.list, [])
  const [editing, setEditing] = useState(null)
  const writable = can('catalog:write')

  const reorder = useAction(async (items) => {
    list.setData(items)
    list.setData(await categoriesApi.reorder(items.map((category) => category.code)))
    toast('Order saved.')
  })
  const remove = useAction(async (category) => {
    if (!(await confirm({ title: `Delete ${category.name}?`, message: 'The category is removed. It has no exams.', confirmLabel: 'Delete category' }))) return
    await categoriesApi.remove(category.code)
    toast(`${category.name} deleted.`)
    list.reload()
  })

  const items = list.data ?? []
  return (
    <>
      <PageHead
        title="Categories"
        lead="How students browse exams: School Boards, Engineering Entrance, Olympiads… Drag to set the order they appear in."
        actions={
          writable ? (
            <button className="btn primary" onClick={() => setEditing({})}>
              <Icon name="plus" /> Add category
            </button>
          ) : null
        }
      />
      <ErrorState error={list.error || reorder.error || remove.error} onRetry={list.error ? list.reload : undefined} />
      {!list.data && list.loading ? <LoadingState /> : null}
      {list.data && !items.length ? <EmptyState title="No categories" /> : null}
      {items.length ? (
        <div className="card flush">
          <SortableList
            items={items}
            getId={(category) => category.code}
            disabled={!writable || reorder.busy}
            onReorder={reorder.run}
            renderItem={(category, handle) => (
              <div className="category-row">
                {handle ?? <span className="drag-space" />}
                <div className="grow">
                  <strong>{category.name}</strong>
                  {!category.isActive ? <Badge>Hidden</Badge> : null}
                  <div className="muted small">
                    <code>{category.code}</code> · {category.group === 'board' ? 'School boards' : 'Exams'} · {category.description}
                  </div>
                </div>
                <Link className="small" to={`/exams?category=${category.code}`}>
                  {plural(category.exams, 'exam')}
                </Link>
                {writable ? (
                  <button className="btn" onClick={() => setEditing(category)}>
                    Edit
                  </button>
                ) : null}
                {can('catalog:publish') ? (
                  <button className="btn icon ghost danger" onClick={() => remove.run(category)} disabled={category.exams > 0} title={category.exams ? 'Move or delete its exams first' : 'Delete'} aria-label={`Delete ${category.name}`}>
                    <Icon name="trash" />
                  </button>
                ) : null}
              </div>
            )}
          />
        </div>
      ) : null}
      <p className="muted small">Hidden categories, and every exam in them, are not shown to students. The dashboard counts exams in school-board categories as boards.</p>
      {editing ? (
        <CategoryDialog
          category={editing.code ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null)
            toast(`${saved.name} saved.`)
            list.reload()
          }}
        />
      ) : null}
    </>
  )
}

function CategoryDialog({ category, onClose, onSaved }) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [group, setGroup] = useState(category?.group ?? 'exam')
  const [isActive, setActive] = useState(category?.isActive ?? true)
  const save = useAction(async () => {
    if (!name.trim()) throw new Error('Give the category a name.')
    const body = { name: name.trim(), description: description.trim(), group, isActive }
    onSaved(category ? await categoriesApi.update(category.code, body) : await categoriesApi.create(body))
  })
  return (
    <Dialog
      title={category ? `Edit ${category.name}` : 'Add a category'}
      onClose={onClose}
      busy={save.busy}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save.run} disabled={save.busy}>
            {category ? 'Save' : 'Add category'}
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          save.run()
        }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Law Entrance" autoFocus />
        </Field>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="CLAT, AILET and other law entrance exams" />
        </Field>
        <Field label="Kind">
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {GROUPS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Toggle checked={isActive} onChange={setActive} label="Shown to students" />
        <ErrorText>{save.error}</ErrorText>
      </form>
    </Dialog>
  )
}
