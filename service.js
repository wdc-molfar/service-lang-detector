const { ServiceWrapper } = require("@molfar/csc")
const { AmqpManager, Middlewares } = require("@molfar/amqp-client")
const { extend, find } = require("lodash")
const LanguageDetect = require('languagedetect')
const lngDetector = new LanguageDetect()
const langs = require("langs").all()

const name2locale = name => {
    if( !name ) return null
    let res = find(langs, l => l.name.toLowerCase() == name.toLowerCase())
    if( !res ) return null
    return res["1"]    
}


let service = new ServiceWrapper({
    consumer: null,
    publisher: null,
    config: null,

    async onConfigure(config, resolve) {
        this.config = config

        console.log(`configure ${ this.config._instance_name || this.config._instance_id}`)

        this.consumer = await AmqpManager.createConsumer(this.config.service.consume)

        await this.consumer.use([
            Middlewares.Json.parse,
            Middlewares.Schema.validator(this.config.service.consume.message),
            Middlewares.Error.Log,
            Middlewares.Error.BreakChain,

            async (err, msg, next) => {
                let m = msg.content
                let languages = lngDetector.detect(m.metadata.text, 3)
                m.metadata = extend({}, m.metadata, {
                    nlp: {
                        language: {
                            locale: (languages[0]) ? name2locale(languages[0][0]) : null,
                            scores: languages
                        }    
                    }
                })
                this.publisher.send(m)
                console.log(`${ this.config._instance_name || this.config._instance_id} > detect locale ` , m.md5, m.metadata.nlp.language.locale)
                msg.ack()
            }

        ])

        this.publisher = await AmqpManager.createPublisher(this.config.service.produce)
        
        await this.publisher.use([
            Middlewares.Schema.validator(this.config.service.produce.message),
            Middlewares.Error.Log,
            Middlewares.Error.BreakChain,
            Middlewares.Json.stringify
        ])



        resolve({ status: "configured" })

    },

    onStart(data, resolve) {
        console.log(`start ${ this.config._instance_name || this.config._instance_id}`)
        this.consumer.start()
        resolve({ status: "started" })
    },

    async onStop(data, resolve) {
        console.log(`stop ${ this.config._instance_name || this.config._instance_id}`)
        await this.consumer.close()
        await this.publisher.close()
        resolve({ status: "stoped" })
    }

})

service.start()