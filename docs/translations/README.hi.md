# Tvijo DSHREM — एक कार्य से जाँचे गए परिणाम तक

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo एक साझा विकास वर्कफ़्लो के इर्द-गिर्द ब्राउज़र वर्कस्पेस, VS Code एक्सटेंशन और टर्मिनल टूल्स लाता है। कार्य का वर्णन करें, उसका execution host और अनुमतियाँ चुनें, बदलावों की जाँच करें, और परिणाम स्वीकार करने में उपयोग किए गए साक्ष्य सुरक्षित रखें। यह गाइड उत्पाद का परिचय देती है; CLI के लिए रिपॉज़िटरी का तकनीकी README और कमांड संदर्भ ही अधिकारिक हैं।

## अपने पसंदीदा वर्कस्पेस से शुरुआत करें

[DSHREM](https://dsh.tvijo.com/) खोलें, [VS Code एक्सटेंशन और टर्मिनल निर्देश](https://dsh.tvijo.com/download) प्राप्त करें, या [settings explained](https://dsh.tvijo.com/knowledge/settings-explained) पढ़ें। सेवा के समर्थित account फ़्लो के माध्यम से साइन इन करें। प्रदाता API कुंजियाँ कभी भी साझा किए गए prompt, सार्वजनिक issue या रिपॉज़िटरी में न भेजें।

Node.js CLI के लिए Node 22 या उससे नया आवश्यक है। स्थानीय checkout से:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

यह कमांड `dshrem` के रूप में भी उपलब्ध है। यह रिमोट chat CLI सुझाए गए टूल्स को दिखाता है, उन्हें निष्पादित नहीं करता। स्थानीय संपादन और कमांड निष्पादन VS Code Agent या स्पष्ट रूप से कॉन्फ़िगर किए गए host runtime के अंतर्गत आते हैं; उनकी अनुमतियाँ अलग होती हैं। देखें [CLI help](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md)।

## विकल्पों को समझें

**Evidence first** समर्थित तथ्यों को अनुमानों से अलग करता है। **Plan and check** एक संक्षिप्त योजना माँगता है और परिणाम को अनुरोध के विरुद्ध जाँचता है। **Review the answer** एक ड्राफ़्ट को चुनौती देता है; जब तक अलग से कोई reviewer स्पष्ट रूप से नियुक्त न हो, यह स्व-समीक्षा ही है। इनमें से कोई भी विधि शुद्धता या कम token उपयोग की गारंटी नहीं देती।

Task presets पुन: उपयोग योग्य निर्देश और चेकलिस्ट जोड़ते हैं। वे अतिरिक्त model memory नहीं बनाते। बड़े context collection को फिर भी सेवा और model अनुरोध सीमाओं में फ़िट होना पड़ता है। उन्नत controller, Python और state पथ चयनित extension host को संदर्भित करते हैं; Remote SSH में वह रिमोट सर्वर होता है।

## जब सहायक हो तो टीम के साथ काम करें

एक AGENTROY टीम एक coordinator, implementers और reviewers को अलग-अलग ज़िम्मेदारियाँ सौंपती है। Host policies DSHREM ds41f और account-based Codex या Claude टूल्स का अनुरोध कर सकती हैं, वैकल्पिक architectural review के साथ। उपलब्धता इंस्टॉल किए गए runtime, account पहुँच और चुनी गई policy पर निर्भर करती है। गुम सदस्यता को चुपचाप भुगतान वाले API कॉल में नहीं बदलना चाहिए।

तीन से छह भूमिकाएँ संगठनात्मक विकल्प हैं, गुणवत्ता का कोई सूत्र नहीं। Reviewers को artifact का सटीक संस्करण और test evidence चाहिए। गंभीर रूप से विफल जाँच स्वीकृति को रोकती है, भले ही models सहमत हों। पढ़ें [agent teams and visible costs](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs)।

## अनिश्चितता छिपाए बिना फिर से शुरू करें

Detached server-side tmux session लैपटॉप या फ़ोन डिस्कनेक्ट होने के बाद भी जारी रह सकता है। बंद (powered-off) स्थानीय कंप्यूटर पर काम जारी नहीं रह सकता। सर्वर विफलता, memory pressure और storage loss के लिए फिर भी recovery आवश्यक है। और काम शुरू करने से पहले सहेजे गए task ID से फिर से कनेक्ट करें और उसका अंतिम confirmed event जाँचें। जिस billable अनुरोध का परिणाम अज्ञात हो, उसे बिना सोचे दोहराएँ नहीं। देखें [disconnects and recovery](https://dsh.tvijo.com/knowledge/durable-work-and-recovery)।

## लागत और डेटा दिखाई देते रखें

स्वीकृत quote, task cap, reserved amount और usage receipt की समीक्षा करें। 8% service markup USD1.00 के provider उपयोग को अलग से बताए गए शुल्कों से पहले USD1.08 में बदल देगा; यह एक उदाहरण है, मूल्य प्रस्ताव नहीं। Subscription quotas, provider charges और server resources अलग-अलग सीमाएँ हैं। अतिरिक्त बजट के लिए स्पष्ट चयन आवश्यक है।

स्थानीय CLI credential फ़ाइलें owner-only permissions का उपयोग करती हैं। ये permissions न तो encryption हैं और न ही backup। Knowledge upload स्पष्ट होता है; निजी फ़ाइलें कभी भी सार्वजनिक handoff लिंक में नहीं जानी चाहिए। [Prompt handoffs](https://dsh.tvijo.com/knowledge/prompt-handoffs) बताते हैं कि समीक्षित कार्य को किसी अन्य टूल में कैसे कॉपी करें।

इस रिपॉज़िटरी का package वर्तमान में `UNLICENSED` के रूप में चिह्नित है; प्रकाशन पुन: उपयोग के अधिकार नहीं देता। पुनर्वितरण से पहले वर्तमान package metadata और licensing notice देखें। अनुवाद परिचयात्मक गाइड हैं, जो DSHREM से बनाए गए और संरचनात्मक एकरूपता के लिए जाँचे गए हैं; तकनीकी अंतरों के लिए अंग्रेज़ी ही संदर्भ है।
