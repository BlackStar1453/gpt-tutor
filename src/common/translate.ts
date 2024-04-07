/* eslint-disable camelcase */
import * as utils from '../common/utils'
import * as lang from './components/lang/lang'
import { urlJoin } from 'url-join-ts'
import { v4 as uuidv4 } from 'uuid'
import { getLangConfig, LangCode } from './components/lang/lang'
import { getUniversalFetch } from './universal-fetch'
import { Action } from './internal-services/db'
import { oneLine } from 'common-tags'
import { ResponseContent } from './types'
import Browser from 'webextension-polyfill'
export type TranslateMode = 'built-in' | 'translate' | 'explain-code'
export type Provider = 'OpenAI' | 'ChatGPT' | 'Azure'
export type APIModel =
    | 'gpt-3.5-turbo'
    | 'gpt-3.5-turbo-0301'
    | 'gpt-4'
    | 'gpt-4-0314'
    | 'gpt-4-32k'
    | 'gpt-4-32k-0314'
    | string

interface BaseTranslateQuery {
    activatedActionName: string
    text: string
    mode?: Exclude<TranslateMode, 'big-bang'>
    action: Action
    onMessage: (message: { content: string; role: string; isFullText?: boolean }) => void
    onError: (error: string) => void
    onFinish: (reason: string) => void
    onStatusCode?: (statusCode: number) => void
    signal: AbortSignal
}

type TranslateQueryBigBang = Omit<
    BaseTranslateQuery,
    'mode' | 'action' | 'selectedWord' | 'detectFrom' | 'detectTo'
> & {
    mode: 'big-bang'
    articlePrompt: string
}

export type TranslateQuery = BaseTranslateQuery | TranslateQueryBigBang

export interface TranslateResult {
    text?: string
    from?: string
    to?: string
    error?: string
}

export class QuoteProcessor {
    private quote: string
    public quoteStart: string
    public quoteEnd: string
    private prevQuoteStartBuffer: string
    private prevQuoteEndBuffer: string

    constructor() {
        this.quote = uuidv4().replace(/-/g, '').slice(0, 4)
        this.quoteStart = `<${this.quote}>`
        this.quoteEnd = `</${this.quote}>`
        this.prevQuoteStartBuffer = ''
        this.prevQuoteEndBuffer = ''
    }

    public processText(text: string): string {
        const deltas = text.split('')
        const targetPieces = deltas.map((delta) => this.processTextDelta(delta))
        return targetPieces.join('')
    }

    private processTextDelta(textDelta: string): string {
        if (textDelta === '') {
            return ''
        }
        if (textDelta.trim() === this.quoteEnd) {
            return ''
        }
        let result = textDelta
        // process quote start
        let quoteStartBuffer = this.prevQuoteStartBuffer
        // console.debug('\n\n')
        // console.debug('---- process quote start -----')
        // console.debug('textDelta', textDelta)
        // console.debug('this.quoteStartbuffer', this.quoteStartBuffer)
        // console.debug('start loop:')
        let startIdx = 0
        for (let i = 0; i < textDelta.length; i++) {
            const char = textDelta[i]
            // console.debug(`---- i: ${i} startIdx: ${startIdx} ----`)
            // console.debug('char', char)
            // console.debug('quoteStartBuffer', quoteStartBuffer)
            // console.debug('result', result)
            if (char === this.quoteStart[quoteStartBuffer.length]) {
                if (this.prevQuoteStartBuffer.length > 0) {
                    if (i === startIdx) {
                        quoteStartBuffer += char
                        result = textDelta.slice(i + 1)
                        startIdx += 1
                    } else {
                        result = this.prevQuoteStartBuffer + textDelta
                        quoteStartBuffer = ''
                        break
                    }
                } else {
                    quoteStartBuffer += char
                    result = textDelta.slice(i + 1)
                }
            } else {
                if (quoteStartBuffer.length === this.quoteStart.length) {
                    quoteStartBuffer = ''
                    break
                }
                if (quoteStartBuffer.length > 0) {
                    result = this.prevQuoteStartBuffer + textDelta
                    quoteStartBuffer = ''
                    break
                }
            }
        }
        // console.debug('end loop!')
        this.prevQuoteStartBuffer = quoteStartBuffer
        // console.debug('result', result)
        // console.debug('this.quoteStartBuffer', this.quoteStartBuffer)
        // console.debug('---- end of process quote start -----')
        textDelta = result
        // process quote end
        let quoteEndBuffer = this.prevQuoteEndBuffer
        // console.debug('\n\n')
        // console.debug('---- start process quote end -----')
        // console.debug('textDelta', textDelta)
        // console.debug('this.quoteEndBuffer', this.quoteEndBuffer)
        // console.debug('start loop:')
        let endIdx = 0
        for (let i = 0; i < textDelta.length; i++) {
            const char = textDelta[i]
            // console.debug(`---- i: ${i}, endIdx: ${endIdx} ----`)
            // console.debug('char', char)
            // console.debug('quoteEndBuffer', quoteEndBuffer)
            // console.debug('result', result)
            if (char === this.quoteEnd[quoteEndBuffer.length]) {
                if (this.prevQuoteEndBuffer.length > 0) {
                    if (i === endIdx) {
                        quoteEndBuffer += char
                        result = textDelta.slice(i + 1)
                        endIdx += 1
                    } else {
                        result = this.prevQuoteEndBuffer + textDelta
                        quoteEndBuffer = ''
                        break
                    }
                } else {
                    quoteEndBuffer += char
                    result = textDelta.slice(0, textDelta.length - quoteEndBuffer.length)
                }
            } else {
                if (quoteEndBuffer.length === this.quoteEnd.length) {
                    quoteEndBuffer = ''
                    break
                }
                if (quoteEndBuffer.length > 0) {
                    result = this.prevQuoteEndBuffer + textDelta
                    quoteEndBuffer = ''
                    break
                }
            }
        }
        // console.debug('end loop!')
        this.prevQuoteEndBuffer = quoteEndBuffer
        // console.debug('totally result', result)
        // console.debug('this.quoteEndBuffer', this.quoteEndBuffer)
        // console.debug('---- end of process quote end -----')
        return result
    }
}

function getConversationId() {
    return new Promise(function (resolve) {
        chrome.storage.local.get(['conversationId'], function (result) {
            const conversationId = result.conversationId?.value
            resolve(conversationId)
        })
    })
}

function getlastMessageId() {
    return new Promise(function (resolve) {
        chrome.storage.local.get(['lastMessageId'], function (result) {
            const lastMessageId = result.lastMessageId?.value
            resolve(lastMessageId)
        })
    })
}

export async function getArkoseToken() {
    const config = await Browser.storage.local.get(['chatgptArkoseReqUrl', 'chatgptArkoseReqForm'])
    const arkoseToken = await getUniversalFetch()(
        'https://tcr9i.chat.openai.com/fc/gt2/public_key/35536E1E-65B4-4D96-9D97-6ADB7EFF8147',
        {
            method: 'POST',
            body: config.chatgptArkoseReqForm,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Origin': 'https://tcr9i.chat.openai.com',
                'Referer': 'https://tcr9i.chat.openai.com/v2/2.4.4/enforcement.f73f1debe050b423e0e5cd1845b2430a.html',
            },
        }
    )
        .then((resp) => resp.json())
        .then((resp) => resp.token)
        .catch(() => null)
    if (!arkoseToken)
        throw new Error(
            'Failed to get arkose token.' +
                '\n\n' +
                "Please keep https://chat.openai.com open and try again. If it still doesn't work, type some characters in the input box of chatgpt web page and try again."
        )
    return arkoseToken as string
}

async function callBackendAPIWithToken(token: string, method: string, endpoint: string, body: any) {
    return fetch(`https://chat.openai.com/backend-api${endpoint}`, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })
}

async function getChatRequirements(token: string) {
    const response = await callBackendAPIWithToken(token, 'POST', '/sentinel/chat-requirements', {
        conversation_mode_kind: 'primary_assistant',
    })
    return response.json()
}

const chineseLangCodes = ['zh-Hans', 'zh-Hant', 'lzh', 'yue', 'jdbhw', 'xdbhw']
export class WebAPI {
    saveConversationContext(name: string, conversationContext: { conversationId: string; lastMessageId: string }) {
        //  使用 chrome.storage.local.set() 保存上下文
        // 保存的键为action.name，然后保存对话ID
        chrome.storage.local.set({
            [`${name}.conversationId`]: {
                value: conversationContext.conversationId,
            },
            [`${name}.lastMessageId`]: {
                value: conversationContext.lastMessageId,
            },
        })
    }

    getConversationContext(name: string) {
        return new Promise(function (resolve) {
            chrome.storage.local.get([`${name}.conversationId`, `${name}.lastMessageId`], function (result) {
                const conversationId = result[`${name}.conversationId`]?.value
                const lastMessageId = result[`${name}.lastMessageId`]?.value
                resolve({ conversationId, lastMessageId })
            })
        })
    }

    getConversationId(name: string) {
        return new Promise(function (resolve) {
            chrome.storage.local.get([`${name}.conversationId`], function (result) {
                const conversationId = result[`${name}.conversationId`]?.value
                resolve(conversationId)
            })
        })
    }

    getLastMessageId(name: string) {
        return new Promise(function (resolve) {
            chrome.storage.local.get([`${name}.lastMessageId`], function (result) {
                const lastMessageId = result[`${name}.lastMessageId`]?.value
                resolve(lastMessageId)
            })
        })
    }

    async translate(query: TranslateQuery) {
        const fetcher = getUniversalFetch()
        let rolePrompt = ''
        let commandPrompt = ''
        let contentPrompt = query.text
        const assistantPrompts: string[] = []
        let quoteProcessor: QuoteProcessor | undefined
        const settings = await utils.getSettings()

        if (query.mode === 'big-bang') {
            rolePrompt = oneLine`
        You are a professional writer
        and you will write ${query.articlePrompt}
        based on the given words`
            commandPrompt = oneLine`
        Write ${query.articlePrompt} of no more than 160 words.
        The article must contain the words in the following text.
        The more words you use, the better`
        } else {
            const sourceLangCode = query.detectFrom
            const targetLangCode = query.detectTo
            const sourceLangName = lang.getLangName(sourceLangCode)
            const targetLangName = lang.getLangName(targetLangCode)
            const toChinese = chineseLangCodes.indexOf(targetLangCode) >= 0
            console.debug('sourceLang', sourceLangName)
            console.debug('targetLang', targetLangName)
            const targetLangConfig = getLangConfig(targetLangCode)
            const sourceLangConfig = getLangConfig(sourceLangCode)
            rolePrompt = targetLangConfig.rolePrompt

            switch (query.action.mode) {
                case null:
                case undefined:
                    if (
                        (query.action.rolePrompt ?? '').includes('${text}') ||
                        (query.action.commandPrompt ?? '').includes('${text}')
                    ) {
                        contentPrompt = ''
                    } else {
                        contentPrompt = '"""' + query.text + '"""'
                    }
                    rolePrompt = (query.action.rolePrompt ?? '')
                        .replace('${sourceLang}', sourceLangName)
                        .replace('${targetLang}', targetLangName)
                        .replace('${text}', query.text)
                    commandPrompt = (query.action.commandPrompt ?? '')
                        .replace('${sourceLang}', sourceLangName)
                        .replace('${targetLang}', targetLangName)
                        .replace('${text}', query.text)
                    if (query.action.outputRenderingFormat) {
                        commandPrompt += `. Format: ${query.action.outputRenderingFormat}`
                    }
                    break
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: Record<string, any> = {
            model: settings.apiModel,
            temperature: 0,
            max_tokens: 4096,
            top_p: 1,
            frequency_penalty: 1,
            presence_penalty: 1,
            stream: true,
        }

        let apiKey = ''
        let arkoseToken = ''
        if (settings.provider !== 'ChatGPT') {
            apiKey = await utils.getApiKey()
        }
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }

        let isChatAPI = true
        if (
            settings.provider === 'Azure' &&
            settings.apiURLPath &&
            settings.apiURLPath.indexOf('/chat/completions') < 0
        ) {
            // Azure OpenAI Service supports multiple API.
            // We should check if the settings.apiURLPath is match `/deployments/{deployment-id}/chat/completions`.
            // If not, we should use the legacy parameters.
            isChatAPI = false
            body[
                'prompt'
            ] = `<|im_start|>system\n${rolePrompt}\n<|im_end|>\n<|im_start|>user\n${commandPrompt}\n${contentPrompt}\n<|im_end|>\n<|im_start|>assistant\n`
            body['stop'] = ['<|im_end|>']
        } else if (settings.provider === 'ChatGPT') {
            let resp: Response | null = null
            resp = await fetcher(utils.defaultChatGPTAPIAuthSession, { signal: query.signal })
            if (resp.status !== 200) {
                query.onError?.('Failed to fetch ChatGPT Web accessToken.')
                query.onStatusCode?.(resp.status)
                return
            }
            const respJson = await resp?.json()
            apiKey = respJson.accessToken
            const lastConversationId = await this.getConversationId(query.activatedActionName)
            body = {
                action: 'next',
                messages: [
                    {
                        id: uuidv4(),
                        author: {
                            role: 'user',
                        },
                        content: {
                            content_type: 'text',
                            parts: [`${rolePrompt}\n\n${commandPrompt}:\n${contentPrompt}`],
                        },
                        metadata: {},
                    },
                ],
                model: settings.apiModel, // 'text-davinci-002-render-sha'
                conversation_id: lastConversationId || undefined,
                parent_message_id: uuidv4(),
                conversation_mode: {
                    kind: 'primary_assistant',
                },
                history_and_training_disabled: false,
                force_paragen: false,
                force_paragen_model_slug: '',
                force_rate_limit: false,
                suggestions: [],
            }
        } else {
            const messages = [
                {
                    role: 'system',
                    content: rolePrompt,
                },
                ...assistantPrompts.map((prompt) => {
                    return {
                        role: 'user',
                        content: prompt,
                    }
                }),
                {
                    role: 'user',
                    content: commandPrompt,
                },
            ]
            if (contentPrompt) {
                messages.push({
                    role: 'user',
                    content: contentPrompt,
                })
            }
            body['messages'] = messages
        }

        switch (settings.provider) {
            case 'OpenAI':
            case 'ChatGPT':
                arkoseToken = await getArkoseToken()
                headers['Authorization'] = `Bearer ${apiKey}`
                headers['Openai-Sentinel-Arkose-Token'] = arkoseToken
                break

            case 'Azure':
                headers['api-key'] = `${apiKey}`
                break
        }

        if (settings.provider === 'ChatGPT') {
            const requirement = await getChatRequirements(apiKey)
            headers['Openai-Sentinel-Chat-Requirements-Token'] = requirement.token

            let length = 0
            await utils.fetchSSE(`${utils.defaultChatGPTWebAPI}/conversation`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: query.signal,
                onStatusCode: (status) => {
                    query.onStatusCode?.(status)
                },
                onMessage: (msg) => {
                    let resp
                    try {
                        resp = JSON.parse(msg)
                        this.saveConversationContext(query.activatedActionName, {
                            conversationId: resp.conversation_id,
                            lastMessageId: resp.message.id,
                        })
                        this.conversationContext = {
                            conversationId: resp.conversation_id,
                            lastMessageId: resp.message.id,
                        }
                    } catch {
                        query.onFinish('stop')
                        return
                    }
                    const { finish_details: finishDetails } = resp.message
                    if (finishDetails) {
                        query.onFinish(finishDetails.type)
                        return
                    }
                    const { content, author } = resp.message
                    if (author.role === 'assistant') {
                        const targetTxt = content.parts.join('')
                        let textDelta = targetTxt.slice(length)
                        if (quoteProcessor) {
                            textDelta = quoteProcessor.processText(textDelta)
                        }
                        query.onMessage({ content: textDelta, role: '' })
                        length = targetTxt.length
                    }
                },
                onError: (err) => {
                    if (err instanceof Error) {
                        query.onError(err.message)
                        return
                    }
                    if (typeof err === 'string') {
                        query.onError(err)
                        return
                    }
                    if (typeof err === 'object') {
                        const { detail } = err
                        if (detail) {
                            const { message } = detail
                            if (message) {
                                query.onError(`ChatGPT Web: ${message}`)
                                return
                            }
                        }
                        query.onError(`ChatGPT Web: ${JSON.stringify(err)}`)
                        return
                    }
                    const { error } = err
                    if (error instanceof Error) {
                        query.onError(error.message)
                        return
                    }
                    if (typeof error === 'object') {
                        const { message } = error
                        if (message) {
                            query.onError(message)
                            return
                        }
                    }
                    query.onError('Unknown error')
                },
            })
        } else {
            const url = urlJoin(settings.apiURL, settings.apiURLPath)
            await utils.fetchSSE(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: query.signal,
                onMessage: (msg) => {
                    let resp
                    try {
                        resp = JSON.parse(msg)
                        // eslint-disable-next-line no-empty
                    } catch {
                        query.onFinish('stop')
                        return
                    }

                    const { choices } = resp
                    if (!choices || choices.length === 0) {
                        return { error: 'No result' }
                    }
                    const { finish_reason: finishReason } = choices[0]
                    if (finishReason) {
                        query.onFinish(finishReason)
                        return
                    }

                    let targetTxt = ''
                    if (!isChatAPI) {
                        // It's used for Azure OpenAI Service's legacy parameters.
                        targetTxt = choices[0].text

                        if (quoteProcessor) {
                            targetTxt = quoteProcessor.processText(targetTxt)
                        }

                        query.onMessage({ content: targetTxt, role: '' })
                    } else {
                        const { content = '', role } = choices[0].delta

                        targetTxt = content

                        if (quoteProcessor) {
                            targetTxt = quoteProcessor.processText(targetTxt)
                        }

                        query.onMessage({ content: targetTxt, role })
                    }
                },
                onError: (err) => {
                    if (err instanceof Error) {
                        query.onError(err.message)
                        return
                    }
                    if (typeof err === 'string') {
                        query.onError(err)
                        return
                    }
                    if (typeof err === 'object') {
                        const { detail } = err
                        if (detail) {
                            query.onError(detail)
                            return
                        }
                    }
                    const { error } = err
                    if (error instanceof Error) {
                        query.onError(error.message)
                        return
                    }
                    if (typeof error === 'object') {
                        const { message } = error
                        if (message) {
                            query.onError(message)
                            return
                        }
                    }
                    query.onError('Unknown error')
                },
            })
        }
    }
}
