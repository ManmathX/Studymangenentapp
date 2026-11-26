import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Icon } from './ui.jsx'

/** Mouse, touch and keyboard (Space to pick up, arrows to move, Space to drop). */
function useDragSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
}

/**
 * A vertical list whose items can be dragged by their handle. `onReorder` gets the items in
 * their new order. `renderItem(item, handle)` must put `handle` somewhere in the item.
 */
export function SortableList({ items, getId, onReorder, renderItem, disabled = false, className = '' }) {
  const sensors = useDragSensors()
  const ids = items.map(getId)
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        onReorder(arrayMove(items, ids.indexOf(active.id), ids.indexOf(over.id)))
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <div className={className}>
          {items.map((item) => (
            <SortableItem key={getId(item)} id={getId(item)} disabled={disabled}>
              {(handle) => renderItem(item, handle)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

export function SortableItem({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = { transform: CSS.Translate.toString(transform), transition, position: 'relative', zIndex: isDragging ? 3 : undefined }
  const handle = disabled ? null : (
    <button type="button" className="drag-handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label="Drag to reorder">
      <Icon name="grip" size={14} />
    </button>
  )
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'dragging' : undefined}>
      {children(handle)}
    </div>
  )
}
