import { DraggablePanel } from '@lobehub/ui'
import { memo, useState } from 'react'
import { Flexbox } from 'react-layout-kit'

import { CHAT_TEXTAREA_HEIGHT, CHAT_TEXTAREA_MAX_HEIGHT, HEADER_HEIGHT } from '@/const/layoutTokens'

import Footer from './Footer'
import Head from './Header'
import TextArea from './TextArea'

const ChatInput = memo(() => {
    const [expand, setExpand] = useState<boolean>(false)

    return (
        <DraggablePanel
            fullscreen={expand}
            headerHeight={HEADER_HEIGHT}
            maxHeight={CHAT_TEXTAREA_MAX_HEIGHT}
            minHeight={CHAT_TEXTAREA_HEIGHT}
            onSizeChange={(_, size) => {
                if (!size) return
            }}
            placement='bottom'
            size={{ height: 'auto', width: '100%' }}
            style={{ zIndex: 10 }}
        >
            <Flexbox
                gap={8}
                height={'100%'}
                padding={'12px 0 16px'}
                style={{ minHeight: CHAT_TEXTAREA_HEIGHT, position: 'relative' }}
            >
                <Head expand={expand} setExpand={setExpand} />
                <TextArea setExpand={setExpand} />
                <Footer setExpand={setExpand} />
            </Flexbox>
        </DraggablePanel>
    )
})

export default ChatInput
