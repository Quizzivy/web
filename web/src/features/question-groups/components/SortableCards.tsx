import { useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

/** CardItem is one card of a group's stack, and whether a drag may move it. */
export interface CardItem {
  id: string;
  movable: boolean;
  node: ReactNode;
}

/**
 * SortableCards is a group's stack of cards where a card that may move is
 * dragged into another place (web#23). A press that travels less than 6px is
 * still the card's click, so a closed card opens as before; the drop calls
 * `onPlace` with the index the card lands at. The keyboard moves a card from
 * its menu, as the outline's rows do, so the drag has no keyboard sensor of
 * its own. It is the default export so the pane can fetch it lazily, which
 * keeps `@dnd-kit` behind a dynamic import (`router-chunks.test.ts`).
 */
export default function SortableCards({
  items,
  onPlace,
}: Readonly<{
  items: readonly CardItem[];
  onPlace: (questionId: string, index: number) => void;
}>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const { t } = useTranslation();
  // The library's live region is fixed at the viewport's corner, a pixel past
  // its edge; inside a box that contains layout it sits in the pane instead.
  const [live, setLive] = useState<HTMLElement | null>(null);
  const ids = items.map((item) => item.id);
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const index = ids.indexOf(String(over.id));
    if (index >= 0) onPlace(String(active.id), index);
  }
  return (
    <>
      <div ref={setLive} className="absolute size-0 overflow-hidden [contain:layout]" />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          ...(live ? { container: live } : {}),
          screenReaderInstructions: { draggable: t("builder.dragInstructions") },
          announcements: {
            onDragStart: () => t("builder.dragStarted"),
            onDragOver: () => t("builder.dragOver"),
            onDragEnd: () => t("builder.dragDropped"),
            onDragCancel: () => t("builder.dragCancelled"),
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableCard key={item.id} id={item.id} movable={item.movable}>
              {item.node}
            </SortableCard>
          ))}
        </SortableContext>
      </DndContext>
    </>
  );
}

function SortableCard({
  id,
  movable,
  children,
}: Readonly<{ id: string; movable: boolean; children: ReactNode }>) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id,
    // A card that may not move is still a place another card can drop at.
    disabled: { draggable: !movable, droppable: false },
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-card-drag={movable ? "" : undefined}
      className={cn(
        "min-w-0",
        movable && "cursor-grab touch-pan-y",
        isDragging && "relative z-10 cursor-grabbing opacity-80 shadow-lg",
      )}
      {...(movable ? listeners : {})}
    >
      {children}
    </div>
  );
}
