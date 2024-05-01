/* eslint-disable @typescript-eslint/no-explicit-any */
import isEqual from 'fast-deep-equal'
import React, { memo, useEffect, useRef, useState } from 'react'
import { Flexbox } from 'react-layout-kit'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useChatStore } from '@/store/chat'
import { chatSelectors } from '@/store/chat/selectors'
import AutoScroll from '../AutoScroll'
import Item from '../ChatItem'
import InboxWelcome from '../InboxWelcome'

const WELCOME_ID = 'welcome'

const itemContent = (index: number, id: string) => {
    if (id === WELCOME_ID) return <InboxWelcome />

    return index === 0 ? <div style={{ height: 88 }} /> : <Item id={id} index={index - 1} />
}

const VirtualizedList = memo(() => {
    const virtuosoRef = useRef<VirtuosoHandle>(null)
    const [atBottom, setAtBottom] = useState(true)
    console.log('VirtualizedList is working')

    const data = useChatStore((s) => {
        console.log('useChatStore is working')
        const showInboxWelcome = chatSelectors.showInboxWelcome(s)
        console.log('showInboxWelcome', showInboxWelcome)
        const ids = chatSelectors.currentChatIDsWithGuideMessage(s)
        return ['empty', ...ids]
    }, isEqual)
    const [id, chatLoading] = useChatStore((s) => [
        chatSelectors.currentChatKey(s),
        chatSelectors.currentChatLoadingState(s),
    ])
    console.log('VirtualizedList', data)
    console.log('VirtualizedList', id)
    console.log('VirtualizedList', chatLoading)

    useEffect(() => {
        if (virtuosoRef.current) {
            virtuosoRef.current.scrollToIndex({ align: 'end', behavior: 'auto', index: 'LAST' })
        }
    }, [id])

    // overscan should be 1.5 times the height of the window
    const overscan = typeof window !== 'undefined' ? window.innerHeight * 1.5 : 0

    return chatLoading && data.length === 2 ? null : (
        <Flexbox height={'100%'}>
            <Virtuoso
                atBottomStateChange={setAtBottom}
                atBottomThreshold={60}
                computeItemKey={(_: any, item: any) => item}
                data={data}
                followOutput={'auto'}
                initialTopMostItemIndex={data?.length - 1}
                itemContent={itemContent}
                overscan={overscan}
                ref={virtuosoRef}
            />
            <AutoScroll
                atBottom={atBottom}
                onScrollToBottom={(type) => {
                    const virtuoso = virtuosoRef.current
                    switch (type) {
                        case 'auto': {
                            virtuoso?.scrollToIndex({ align: 'end', behavior: 'auto', index: 'LAST' })
                            break
                        }
                        case 'click': {
                            virtuoso?.scrollToIndex({ align: 'end', behavior: 'smooth', index: 'LAST' })
                            break
                        }
                    }
                }}
            />
        </Flexbox>
    )
})
export default VirtualizedList
