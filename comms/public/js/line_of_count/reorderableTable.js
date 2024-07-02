import { MenuOutlined } from '@ant-design/icons';
import { DndContext } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useEffect, useState } from 'react';
import { Table } from 'antd';

const ReorderableTable = ({ columns, rows, onReorder }) => {
    const _columns = [
        {
            key: 'sort'
        },
        ...columns
    ];
    const [dataSource, setDataSource] = useState([]);

    useEffect(() => {
        setDataSource(rows || []);
    }, [rows]);

    const onDragEnd = ({ active, over }) => {
        if (active.id !== over?.id) {
            setDataSource(previous => {
                const activeIndex = previous.findIndex(i => i.key === active.id);
                const overIndex = previous.findIndex(i => i.key === over?.id);
                onReorder(activeIndex, overIndex);
                return arrayMove(previous, activeIndex, overIndex);
            });
        }
    };
    return (
        <DndContext modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
            <SortableContext
                items={dataSource.map(i => i.key)}
                strategy={verticalListSortingStrategy}
            >
                <Table
                    components={{
                        body: {
                            row: Row
                        }
                    }}
                    rowKey="key"
                    columns={_columns}
                    dataSource={dataSource}
                    pagination={false}
                />
            </SortableContext>
        </DndContext>
    );
};

const Row = ({ children, ...props }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: props['data-row-key']
    });
    const style = {
        ...props.style,
        transform: CSS.Transform.toString(
            transform && {
                ...transform,
                scaleY: 1
            }
        ),
        transition,
        ...(isDragging
            ? {
                  position: 'relative',
                  zIndex: 9999
              }
            : {})
    };
    return (
        <tr {...props} ref={setNodeRef} style={style} {...attributes}>
            {React.Children.map(children, child => {
                if (child.key === 'sort') {
                    return React.cloneElement(child, {
                        children: (
                            <MenuOutlined
                                ref={setActivatorNodeRef}
                                style={{
                                    touchAction: 'none',
                                    cursor: 'move'
                                }}
                                {...listeners}
                            />
                        )
                    });
                }
                return child;
            })}
        </tr>
    );
};

export default ReorderableTable;
