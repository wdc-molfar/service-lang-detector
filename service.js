const { ServiceWrapper, AmqpManager, Middlewares } = require("@molfar/service-chassis")
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

        this.consumer = await AmqpManager.createConsumer(this.config.service.consume)

        await this.consumer.use([
            Middlewares.Json.parse,
            Middlewares.Schema.validator(this.config.service.consume.message),
            Middlewares.Error.Log,
            Middlewares.Error.BreakChain,

            async (err, msg, next) => {
                
                let m = msg.content

                let languages = lngDetector.detect(m.scraper.message.text, 3)
                
                m = extend({}, m, {
                    langDetector: {
                        language: {
                            locale: (languages[0]) ? name2locale(languages[0][0]) : null,
                            scores: languages
                        }    
                    }
                })
                
                console.log(m)

                this.publisher.send(m)
               
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
        this.consumer.start()
        resolve({ status: "started" })
    },

    async onStop(data, resolve) {
        await this.consumer.close()
        await this.publisher.close()
        resolve({ status: "stoped" })
    }

})

service.start()