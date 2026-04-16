# AI & Smart Features Research — Laundry Logistics Platform

> Compiled research across voice ordering, image recognition, Bluetooth scales, photo capture, and AI chatbot/control features. Sources cited throughout.

---

## 1. AI Voice Ordering

### How Users Place Laundry Orders by Voice

Voice ordering enables users to say things like _"Pick up my laundry at 3pm tomorrow"_ and have the system parse the intent, extract entities (time, address, service type), and trigger an order. The architecture follows a three-stage pipeline:

```
Speech → ASR (Speech-to-Text) → NLP (Intent + Entity Extraction) → Action (API call / order creation)
```

For laundry specifically, the key entities to extract are:
- **Service type**: wash & fold, dry cleaning, ironing
- **Pickup time**: date + time window (relative: "tomorrow at 3pm", absolute: "Friday morning")
- **Pickup address**: may default to saved address on account
- **Quantity signals**: "one bag", "a lot of clothes", "my work shirts"
- **Special instructions**: "no fabric softener", "hang dry the delicates"

### ASR APIs & Services

| API | Best For | Accuracy (WER) | Real-Time Streaming | Pricing |
|-----|----------|----------------|---------------------|---------|
| **OpenAI Whisper** (API) | Accents, multilingual, noisy audio | ~8% (best in class) | No (batch only) | ~$0.006/min |
| **OpenAI Realtime API** (GPT-4o) | End-to-end voice conversations | Native LLM accuracy | Yes (WebSocket/WebRTC) | ~$0.06/min input |
| **Google Speech-to-Text** | Enterprise streaming, clean audio | 16–21% WER | Yes (streaming) | ~$0.016/min |
| **Amazon Transcribe** | AWS-native apps | 18–22% WER | Yes | ~$0.024/min |
| **Deepgram** | Low-latency streaming | Competitive | Yes | ~$0.0043/min |

**Key finding**: [Gladia's benchmark](https://www.gladia.io/blog/openai-whisper-vs-google-speech-to-text-vs-amazon-transcribe) shows OpenAI Whisper-v2 achieves the lowest WER (8.06%) and is best for accuracy, while Google STT excels at real-time streaming with punctuation. Whisper does not support native streaming, making it better for post-utterance processing.

**The modern recommended approach** is the [OpenAI Realtime API](https://openai.com/index/introducing-the-realtime-api/), which handles the full voice pipeline (STT + LLM reasoning + TTS) in a single WebSocket/WebRTC connection with GPT-4o. It supports function calling, meaning a voice assistant can directly trigger order placement, check availability, and retrieve customer context — no separate NLP layer needed.

```javascript
// Realtime API WebSocket connection (server-side)
import WebSocket from "ws";
const ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime", {
  headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY }
});
// For browser/mobile: use WebRTC with ephemeral token
```

For browser or mobile clients, WebRTC is the recommended transport. For server-to-server (e.g., phone line integration via Twilio), WebSocket is preferred. ([OpenAI Realtime API docs](https://developers.openai.com/api/docs/guides/realtime-websocket))

### How Food Delivery Apps Handle Voice Ordering

[AI phone assistants in restaurants](https://trybytes.ai/blogs/how-ai-phone-assistants-use-nlp-for-menus) follow this flow:

1. **Streaming speech recognition** — transcribes audio as it's received, no wait for sentence completion
2. **Intent identification** — e.g., "What's your spiciest dish?" → `GET_MENU_RECOMMENDATION`
3. **Entity extraction** — menu items, modifiers, delivery time, address
4. **Confirmation and follow-up** — "You're interested in a 3pm pickup tomorrow at 456 Oak St — shall I confirm?"
5. **State management** — preserves conversation context across turns

[Food ordering NLP chatbots built on Dialogflow](https://ijsra.net/sites/default/files/fulltext_pdf/IJSRA-2025-1313.pdf) demonstrate these intent accuracy benchmarks:

| Intent | Accuracy |
|--------|----------|
| Order Food / Place Pickup | 94.5% |
| Check Menu / Service Info | 91.8% |
| Track Delivery | 89.6% |
| Modify Order | 85.3% |

Average response time for order placement: ~2.5 seconds.

**Real-world laundry example**: [Laundrapp built an Alexa skill](https://developer.amazon.com/blogs/alexa/post/77c76619-f702-4276-b30a-9a4814161bcb/with-laundrapp-s-alexa-skill-customers-simply-ask-alexa-to-take-care-of-the-laundry) allowing customers to book pickups by voice. Key challenges:
- Preserving **state across multi-turn conversation** (e.g., negotiating pickup time, then delivery time)
- Even a simple order requires: pickup address, collection time, delivery address, delivery time
- They used state design patterns to manage conversation flow
- Required 20+ functional tests across all conversation paths

### The NLP Pipeline: Speech → Intent → Action

```
[User speaks]
     ↓
[ASR: Speech-to-Text]  ← Whisper / Google STT / Deepgram
     ↓
[Text utterance]
     ↓
[Intent Classification]  ← "schedule_pickup", "check_status", "modify_order"
     ↓
[Entity Extraction]      ← {time: "3pm tomorrow", address: "saved", service: "wash_fold"}
     ↓
[Slot Filling / Clarification]  ← Any missing required fields?
     ↓
[Confirmation dialog]    ← "Confirming pickup Friday 3–5pm at 123 Main St — correct?"
     ↓
[API Action]             ← POST /orders with extracted params
     ↓
[TTS Response]           ← "Your pickup is scheduled. You'll get a confirmation text."
```

For an LLM-native approach (GPT-4o Realtime), the intent/entity extraction is handled by the model itself via function calling — no separate NLP classifier is needed.

### Handling Ambiguity and Confirmation

**Ambiguity resolution strategies:**
- **Default to saved preferences**: If user says "pick up my laundry tomorrow," default to their stored address and service type; only ask for time
- **Constrained slot-filling**: Offer specific choices ("Morning or afternoon?") rather than open-ended questions
- **Progressive clarification**: Ask one missing field at a time, not all at once
- **Confidence thresholds**: If ASR confidence < threshold (e.g., 80%), re-prompt ("I didn't catch that — did you say 3pm or 13pm?")

**Confirmation dialog best practices** (per [Nielsen Norman Group](https://www.nngroup.com/articles/confirmation-dialog/)):
- Always confirm **before irreversible actions** (order placement, payment)
- Be specific: say "Confirming wash & fold pickup Saturday 2–4pm at 456 Oak St" not "Shall I proceed?"
- Use **summarize-then-confirm** pattern: read back all order details, then ask for Yes/No
- Don't over-confirm: routine repeat orders with saved preferences need minimal friction
- For voice: a simple spoken "Yes" or "No" confirmation is best UX

**Handling edge cases:**
- **Time conflicts**: "I need a pickup right now" → check driver availability, offer nearest slot
- **Address ambiguity**: "at home" → verify default address on file
- **Multi-item instructions**: capture via follow-up ("Any special care instructions? E.g., delicates, hang dry?")

---

## 2. Image Recognition

### Can AI Identify Clothing Types, Fabric Types, and Stains?

**Yes — and at high accuracy for clothing types:**

A [Stanford CS230 deep learning project](https://jamesbraza.com/projects/laundry-classification/) achieved **99.5% accuracy** classifying laundry items using VGG16 pretrained on ImageNet. The model was trained on a custom laundry dataset. Limitations: semantically similar classes (e.g., "long sleeve" vs "outerwear") caused confusion; few-shot generalization to unseen classes was weaker (F1: 35.9%).

For **fabric defect and stain detection**, [AI-based textile inspection systems](https://www.brightpoint.ai/post/ai-based-defect-detection-in-textile-and-garment-manufacturing) achieve **95%+ defect detection accuracy** using deep CNNs trained on textile datasets. Detectable defect types include:
- Holes, tears, broken yarns
- Oil stains, contamination
- Color bleeding, uneven dye
- Stitch irregularities

[Fabric stain datasets](https://www.indiantextilemagazine.in/it-is-time-for-ai-computer-vision-to-detect-fabric-defects/) exist covering 450+ images of ink, oil, and dirt stains across fabric types.

**Patent evidence**: LG Electronics [patented an AI laundry treatment system](https://patents.google.com/patent/EP3957791A1/en) that uses a camera + ML model to identify clothing type, fabric composition ratio, and recommend wash cycles — without reading care labels. The model extracts "textile data" from images and applies it to a laundry recognition model trained via deep learning.

**Key limitations for a pickup service context:**
- Photos must have consistent lighting and angles for reliable classification
- Stain detection requires close-up, not bag-level photos
- Garment-level classification works best on individual, unfolded items
- A dirty laundry bag photo will mostly show the bag exterior, not garment details

### APIs and Models Available

| Tool | Capability | Notes |
|------|-----------|-------|
| **OpenAI GPT-4o Vision** | General clothing, stain description, garment type | ~80% brand recognition; can hallucinate; good for natural language descriptions of clothing |
| **Google Cloud Vision API** | Clothing detection, dominant colors, pattern/garment type | [Supports style detection](https://cloud.google.com/blog/products/ai-machine-learning/introducing-style-detection-for-google-cloud-vision-api) with 52–97% accuracy on style classification |
| **Google Vertex AI** | Custom model training on garment data | Better for specific classification tasks |
| **Custom CNN (VGG16, ResNet, EfficientNet)** | Laundry-specific classification | Highest accuracy for specific use case when trained on domain data |
| **Edge Impulse** | On-device ML for weight/visual regression | Good for embedded/mobile edge deployment |
| **Brightpoint DefectGuard** | Textile defect detection | Specialist B2B manufacturing tool |

**Recommendation for laundry logistics**: Use GPT-4o Vision for **initial garment identification** (flexible, no training needed), then fine-tune a **custom model** (EfficientNet or ViT) for high-frequency classification tasks like garment type sorting. For stain detection at intake, use a custom CNN trained on the [fabric stain dataset from University of Moratuwa](https://www.indiantextilemagazine.in/it-is-time-for-ai-computer-vision-to-detect-fabric-defects/).

### Weight Estimation from Photos

**Visual weight estimation is technically feasible but limited for laundry bags:**

[Edge Impulse demonstrated](https://www.edgeimpulse.com/blog/estimate-weight-from-a-photo-using-visual-regression-in-edge-impulse/) 99.02% accuracy estimating the weight of rice piles from photos using a visual regression model. This works because rice is a consistent, uniform material. Laundry bags are far more irregular:

- **Variable density**: A bag of jeans weighs more than the same-sized bag of t-shirts
- **Variable packing**: Loosely vs tightly packed changes volume-to-weight ratio
- **Occlusion**: You can't see inside the bag
- **Data requirements**: The rice model needed 2,050 training images (50 per 10g increment)

[Research on food weight estimation from 2D images](https://arxiv.org/html/2405.16478v1) (Faster R-CNN + MobileNetV3) achieved MAPE of 6.4% for uniform foods, but laundry lacks that uniformity.

**Practical recommendation**: For weight estimation, **visual estimation is a rough guide only** (±30–50%). Use it to set customer expectations ("Looks like a medium-sized bag, ~8–12 lbs") and combine with:
- **Driver-confirmed weight** using a Bluetooth scale at pickup (see Section 3)
- **Historical data per customer**: After 3 orders, you know their typical bag weight
- **Customer self-report**: "About how many bags?" + size selection (S/M/L/XL)

### How Competitors Use Image Recognition

| Competitor | Image Recognition Usage |
|-----------|------------------------|
| **NoScrubs** | Collects images/videos throughout order; AI analyzes drop-off photos to verify location match; AI itemizes each garment to ensure nothing missing; evaluates folding quality; detects weight mismatches ([source](https://www.smdp.com/ai-powered-laundry-service-noscrubs-launches-in-santa-monica-with-4-hour-turnaround/)) |
| **Hampr** | QR codes on hampers link to care instructions; no image recognition reported |
| **Turns (laundromat SaaS)** | Driver fleet app captures images at pickup and delivery; images stored in business manager |
| **GE SmartHQ** | AI laundry assistant accepts photo of stain, recommends wash cycle automatically; powered by Google Cloud generative AI |
| **Samsung Bespoke AI** | AI Wash+ detects fabric type (normal, denim, towel, synthetics) using weight + moisture sensors in-machine; not photo-based |

---

## 3. Bluetooth Scale Integration

### How Bluetooth Scales Work with Mobile Apps

BLE (Bluetooth Low Energy) scales operate on the **GATT (Generic Attribute Profile)** protocol stack. The scale acts as a **GATT Server** (peripheral), and the mobile app acts as a **GATT Client** (central). Connection flow:

```
1. App scans for BLE devices → filter by Weight Scale Service (UUID 0x181D)
2. User selects scale → app connects to GATT server
3. App subscribes to "Weight Measurement" characteristic (UUID 0x2A9D)
4. Scale sends Indicate notifications when weight changes
5. App decodes value: weight = uint16 × 0.005 kg
6. Display and store weight reading
```

### BLE Protocols and Standards

There are two main approaches ([WSI Scales](https://wsi-scales.com/index.php/ble-weighing-scales/)):

**Standard BLE Weight Scale (Bluetooth SIG compliant):**
- Service UUID: `0x181D` (Weight Scale Service)
- Characteristic UUID: `0x2A9D` (Weight Measurement)
- Resolution: 0.005 kg (5 grams)
- Encoding: uint16, value × 0.005 = kg
- Compatible with: nRF Connect, Android BLE apps, iOS CoreBluetooth

**Custom ASCII BLE Scale (higher precision):**
- Custom characteristic UUID: `0xFFF1`
- Transmits weight as ASCII string (e.g., `"0.251"`)
- Resolution: 0.001 kg (1 gram)
- Easier to parse, human-readable directly
- Used for labs, IoT, high-precision dashboards

**Bluetooth SIG formal specification** ([Weight Scale Service v1.0.1](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/WSS_v1.0.1/out/en/index-en.html)) also supports BMI, height, and user data. For logistics/laundry, only weight measurement is needed.

**Mobile SDK integration:**
- **iOS**: CoreBluetooth framework (Swift)
- **Android**: Bluetooth Low Energy API (Kotlin/Java)
- **Cross-platform**: React Native BLE libraries, Flutter BLE plugins

### Can a Web App Connect to Bluetooth Scales? (Web Bluetooth API)

**Yes, but with significant browser limitations.**

The [Web Bluetooth API](https://stormotion.io/blog/web-ble-implementation/) allows web browsers to connect directly to BLE devices via `navigator.bluetooth.requestDevice()`. No native app required.

```javascript
// Request Weight Scale device
navigator.bluetooth.requestDevice({
  filters: [{ services: ['weight_scale'] }]  // UUID 0x181D
})
.then(device => device.gatt.connect())
.then(server => server.getPrimaryService('weight_scale'))
.then(service => service.getCharacteristic('weight_measurement'))
.then(characteristic => characteristic.startNotifications())
.then(characteristic => {
  characteristic.addEventListener('characteristicvaluechanged', (event) => {
    const weight = event.target.value.getUint16(1, true) * 0.005; // kg
    console.log(`Weight: ${weight} kg`);
  });
});
```

**Browser compatibility** ([TestMu AI compatibility report](https://www.testmuai.com/web-technologies/web-bluetooth/)):

| Browser | Support |
|---------|---------|
| Chrome (desktop + Android) | ✅ Full support (v56+) |
| Microsoft Edge | ✅ Full support (v79+) |
| Opera | ✅ Full support |
| Firefox | ❌ Not supported |
| Safari (iOS and macOS) | ❌ Not supported (privacy policy) |
| Internet Explorer | ❌ Not supported |

**Overall compatibility score: 58/100** — significant gap due to Firefox and Safari exclusions.

**Critical limitation**: Safari on iOS is not supported. This means a web app using Web Bluetooth **will not work for iPhone users** — a major problem for a consumer laundry app. **Recommendation**: Use Web Bluetooth for driver-facing web dashboards on Chrome/Android, but implement native BLE in iOS and Android apps for customer-facing scale features.

**Security requirement**: Web Bluetooth requires a **user gesture** (button tap) to initiate the device chooser. It cannot auto-connect silently.

### Scales Commonly Used in Laundry / Logistics

For laundry pickup weight verification, recommended scale specs:
- **Capacity**: 50–150 kg (for full laundry bags; 10–30 lbs typical)
- **Precision**: 0.1 kg or better (100g resolution is fine for billing)
- **Form factor**: Portable/flat platform, easy to place bag on
- **BLE version**: Bluetooth 4.0+ (BLE)

Suitable product categories:
- **Postal/shipping scales** (e.g., Dymo S100, USPS-certified): 0–100 lb range, BLE connectivity
- **Commercial floor scales with BLE**: For facility-side use (laundromat intake)
- **Personal/fitness scales**: Not recommended for commercial use (limited capacity, not NIST-certified)

### Calibration and Accuracy

[Industrial scale calibration best practices](https://bizautom.com/how-to-ensure-accurate-readings-with-industrial-smart-scale-calibration/):

- **25% of industrial weighing systems** don't meet accuracy standards due to improper calibration (Mettler Toledo study)
- Calibrate **at least monthly**, more often in high-use environments
- **Two-point calibration**: At minimum and maximum expected weights for full-range accuracy
- **Zero the scale before each use**: Tare function to account for bag/container weight
- **Environmental factors**: Keep away from airflow, vibration, magnetic fields
- Place on a **flat, level surface** — any tilt affects readings
- Use **NIST-certified calibration weights** for verification

**For a laundry pickup driver app:**
- Auto-tare when scale connects (subtract bag weight if a standard bag is used)
- Display weight reading with 1-second stabilization delay
- Flag readings outside expected range (e.g., >30 kg or <0.5 kg) as potentially errors
- Log scale readings with timestamp and order ID for billing audit trail

---

## 4. Camera / Photo Features

### How Logistics Apps Handle Photo Capture for Proof of Pickup/Delivery

Modern delivery apps treat photo capture as a **mandatory, structured workflow step** — not an optional add-on. Standard implementation ([Track-POD's POD app analysis](https://www.track-pod.com/blog/proof-of-delivery-apps/)):

**Standard Proof of Delivery photo features:**
- Auto-timestamped photos (GPS + time embedded in EXIF or overlaid on image)
- Geofencing: driver can only submit POD photos when within X meters of pickup/delivery address
- Up to 10 photos per delivery event
- Photos stored in cloud, accessible to dispatchers in real-time
- Electronic signature capture alongside photos
- Photos linked to specific order ID in backend

**Apps with this functionality**: Onfleet, Track-POD, Routific, Circuit, Tookan, GSM Tasks

[Timemark camera](https://www.timemark.com/solutions/proof-of-delivery-photo) reports that 70% of Americans now prefer contactless delivery verification (photo) over signatures. GPS-tagged photos without geotags lead to disputes — GPS verification is essential.

**Key UX principle for drivers**: The interface must be frictionless. Driver opens order → taps "Capture Photo" → phone camera opens → takes photo → photo auto-attaches to order → driver confirms. Maximum 3 taps.

### Before/After Photos of Laundry — Implementation

**Before pickup (driver captures):**
1. Photo of bag/items as received at customer door (condition, quantity visual)
2. Weight reading from Bluetooth scale (can be overlaid on photo or logged alongside)
3. Driver marks any visible damage, stains, or missing items

**After cleaning (facility captures):**
1. Photo of clean, folded laundry before packing
2. AI quality check: folding consistency, completeness
3. Photo of packed bag ready for delivery

**At delivery:**
1. Photo of delivered bag at customer door (or customer hand-off)
2. GPS + timestamp proof
3. Customer notification with photo sent via SMS/push

**NoScrubs' implementation** ([source](https://www.smdp.com/ai-powered-laundry-service-noscrubs-launches-in-santa-monica-with-4-hour-turnaround/)): AI compares drop-off photo to pickup location photo to verify correct address. Also uses AI to itemize garments from photos to ensure nothing is missing between pickup and delivery.

### Photo-Based Damage Documentation

For laundry damage claims, the photo capture workflow should:

1. **Capture pre-existing damage at pickup**: Driver photographs any stains, holes, or damage before accepting the order. Customer is notified: "We noted a pre-existing stain on item 3."
2. **Document with bounding boxes or annotations**: The driver or AI tags specific garments in the damage photo
3. **Link to specific garment**: Damage photo is associated with garment ID (or photo-matched garment) in the order
4. **Generate damage report**: Printable/shareable PDF with before/after comparison, timestamps, GPS location
5. **Customer resolution flow**: Customer can dispute or acknowledge the documented damage

**Storage and retention**: [PhotoLedger-type systems](https://www.prlog.org/13136101-photoledger-introduces-structured-photo-documentation-for-business-workflows.html) combine photos with structured form data, upload to SFTP/Dropbox/Google Drive, and create audit-ready records.

### UX Flow for Driver Photo Capture

```
ORDER DETAIL SCREEN
├── [START PICKUP] button
│    └── → Photo prompt appears: "Take photo of items at pickup"
│         └── Camera opens → Photo taken → Auto-tagged with GPS + timestamp
│         └── Optional: "Add damage note" toggle
│              └── → Annotate photo or write free-text note
│         └── [Confirm & Weigh]
│              └── → Bluetooth scale reading captured (auto or manual entry)
│              └── Weight overlaid on or logged with pickup photo
│    └── → Order marked "PICKED UP" in system
│         └── Customer notified with confirmation + photo thumbnail
│
[DELIVERY SCREEN]
├── Navigate to customer
├── [MARK DELIVERED] button
│    └── → Photo prompt: "Take delivery photo at door"
│         └── Geofence check: must be within 50m of address
│         └── Camera opens → Photo → GPS + timestamp auto-tagged
│    └── Order marked "DELIVERED"
│         └── Customer gets push/SMS with delivery photo
```

**Driver app best practices:**
- Geofencing enforcement before photo can be submitted (prevents abuse)
- Large, easy-to-tap camera button (gloves-friendly)
- Offline queue: if no signal, store photo locally and sync when back online
- Flash auto-enabled for dark doorways
- Preview + retake option before submitting

---

## 5. AI Chatbot / Full AI Control

### How AI Can Control the Entire Ordering Experience

An AI-first ordering experience replaces or augments traditional form-based flows with a **conversational interface** that understands natural language, maintains context, and executes actions autonomously.

**Three implementation levels:**

| Level | Description | Technology |
|-------|-------------|------------|
| **Rule-based chatbot** | Scripted decision trees, button menus | Dialogflow, ManyChat, custom |
| **NLP-enhanced chatbot** | Intent/entity classification, natural input | Rasa, Dialogflow CX, GPT with structured prompts |
| **AI-first (LLM-native)** | Full conversational understanding, context memory, function calling | GPT-4o / Claude 3.5 + tool use |

### What "AI-First" Ordering Looks Like

Instead of: Home screen → Select service → Choose date → Enter address → Add instructions → Confirm

Users say or type:
> _"Hey, I need my work clothes picked up Thursday morning — the usual stuff, just make sure to hang dry my button-downs this time."_

The AI:
1. Recognizes this as a `schedule_pickup` intent
2. Extracts: Thursday morning, clothing type (work clothes), special instruction (hang dry button-downs)
3. Queries: user's saved address and default service type
4. Checks: Thursday morning availability
5. Confirms: "I'll schedule a pickup Thursday between 8–10am at 123 Main St. I'll note hang-dry for button-down shirts. Shall I confirm?"
6. User says "Yes" → order created → confirmation sent

**This is the pattern now deployed by Target, DoorDash, and Instacart via ChatGPT** ([LinkedIn](https://www.linkedin.com/posts/matthewvangilder_walmart-openai-partner-for-purchases-in-activity-7383969602898382848-5tXb)), where users place full orders through conversational AI.

### Building a Conversational AI that Understands Laundry Context

**System prompt / context layer** — define laundry-specific knowledge:

```
You are an AI assistant for [LaundryApp]. You help customers:
- Schedule laundry pickups and deliveries
- Check order status and estimated return times
- Specify care instructions for their garments
- Manage subscription plans
- Report damage or issues

Laundry service knowledge:
- Wash & fold: priced per pound, minimum 10 lbs
- Dry cleaning: priced per garment
- Turnaround: standard 48hr, express 24hr, same-day available before 9am
- Pickups available: daily 7am–8pm, in 2-hour windows

When scheduling, collect: service type, pickup date/time window, address (default to saved), special instructions.
Always confirm order details before creating an order.
```

**Function calling (tool use)** — the LLM calls your backend APIs:

```json
{
  "functions": [
    {
      "name": "create_order",
      "description": "Creates a laundry pickup order",
      "parameters": {
        "service_type": "wash_fold | dry_clean | ironing",
        "pickup_datetime": "ISO 8601",
        "pickup_address": "string",
        "delivery_datetime": "ISO 8601",
        "special_instructions": "string",
        "customer_id": "string"
      }
    },
    {
      "name": "get_order_status",
      "parameters": { "order_id": "string" }
    },
    {
      "name": "check_availability",
      "parameters": { "date": "YYYY-MM-DD", "time_preference": "morning|afternoon|evening" }
    }
  ]
}
```

**Context and memory:**
- Store customer preferences (detergent brand, folding style, address) in user profile
- Pass last N orders as context: "Your last order was wash & fold, 12 lbs, picked up Tuesday"
- Track conversation history within session to handle references ("the order I mentioned earlier")

**Chatbot platforms for laundry** (as detailed in [Widget Chat's laundry guide](https://widget-chat.com/blog/dry-cleaning-laundry-chatbot-guide/)):
- Full pickup scheduling with slot selection
- Order tracking by phone number or order ID
- Loyalty program management
- Rush order handling with surcharge calculation
- Corporate/hotel account management
- Stain treatment Q&A

[Fabklean launched a WhatsApp bot](https://fabklean.com/blogs/introducing-the-worlds-first-whatsapp-bot-for-laundry-businesses/) for laundry businesses: collects order details, preferred pickup/delivery times, confirms bookings, sends real-time status updates, and answers FAQs 24/7. [Turns laundromat software](https://www.turnsapp.com/recap) also added a WhatsApp bot for pickup request creation.

[Voice.ai's laundry AI assistant](https://voice.ai/hub/ai-voice-agents/laundry/) handles inbound phone calls for dry cleaners: answers questions, schedules pickups, sends text/email reminders — all via a voice agent that sounds like a human receptionist.

### Integration with Existing AI Assistants

#### Apple Siri / SiriKit
- **SiriKit** allows apps to handle voice commands via predefined intent domains
- Supported domains: Lists, Media, Messaging, Payments, Restaurant reservations, VoIP
- For laundry ordering, use **App Intents framework** (iOS 16+) to define custom intents
- [Apple Intelligence (iOS 18)](https://techcrunch.com/2024/06/10/apple-brings-apple-intelligence-to-developers-via-sirikit-and-app-intents/) enhances SiriKit-enabled apps automatically — Siri gains ability to invoke any app menu item and handle conversational references
- Example custom intent definition:

```swift
// SiriKit custom intent for laundry pickup
struct SchedulePickupIntent: AppIntent {
    static var title: LocalizedStringResource = "Schedule Laundry Pickup"
    
    @Parameter(title: "Pickup Date") var pickupDate: Date?
    @Parameter(title: "Service Type") var serviceType: LaundryService?
    
    func perform() async throws -> some IntentResult {
        // Call your ordering API
        let order = try await LaundryAPI.createPickup(date: pickupDate, service: serviceType)
        return .result(value: order.confirmationNumber)
    }
}
```

#### Google Assistant (App Actions)
- [App Actions](https://developers.google.com/assistant/app) let users voice-enable Android apps with ~"a few days" of integration work
- Uses Built-In Intents (BIIs): `ORDER_MENU_ITEM`, `CREATE_TAXI_RESERVATION` (closest analog for pickup)
- Users say: "Hey Google, schedule a laundry pickup with [AppName]" → app deep-links to scheduling flow
- [Defined in `shortcuts.xml`](https://codelabs.developers.google.com/codelabs/appactions): maps Assistant voice queries to specific Android activities or deep links

#### Amazon Alexa
- **Alexa Skills Kit (ASK)** for custom skill development
- [Laundrapp's Alexa skill](https://developer.amazon.com/blogs/alexa/post/77c76619-f702-4276-b30a-9a4814161bcb/with-laundrapp-s-alexa-skill-customers-simply-ask-alexa-to-take-care-of-the-laundry) (2017) was the first laundry voice ordering skill — validated the concept
- Alexa Skills handle multi-turn conversations with session state preservation
- Miele's Alexa skill controls washing machines by voice and provides stain-removal tips ([Miele](https://www.mieleusa.com/c/voice-assistance-3646.htm))
- Use case: "Alexa, ask LaundryApp to schedule a pickup for Friday morning"

**Integration decision matrix:**

| Platform | Reach | Development Effort | Best For |
|---------|-------|-------------------|----------|
| Siri (iOS) | iOS users only | Medium (SiriKit) | iOS-first app, Apple Intelligence benefits |
| Google Assistant | Android users | Low–Medium (App Actions) | Android users, quick integration |
| Alexa | Smart speaker owners | Medium (ASK) | Home-based users, hands-free kitchen use |
| In-app voice (Realtime API) | All users | Medium (WebRTC/WebSocket) | Most control, best experience, no platform dependency |

**Recommendation**: Build in-app voice ordering as primary (OpenAI Realtime API), then add Siri App Intents and Google App Actions for discoverability. Alexa skill is optional/aspirational for smart speaker penetration.

---

## 6. Summary Recommendations by Priority

### Immediate (MVP)

| Feature | Technology | Effort |
|---------|-----------|--------|
| In-app voice ordering | OpenAI Realtime API (GPT-4o) with function calling | Medium |
| Proof-of-pickup photos | Native camera API with GPS+timestamp overlay | Low |
| AI chatbot (text) | GPT-4o with system prompt + function calling | Low |
| Damage documentation photos | Same as pickup photos, with annotation | Low |

### Near-Term

| Feature | Technology | Effort |
|---------|-----------|--------|
| Bluetooth scale (native app) | CoreBluetooth (iOS) / BLE API (Android) | Medium |
| Clothing type classification | Custom CNN or GPT-4o Vision | Medium |
| Before/after photo comparison | Storage + side-by-side UI | Low |
| Siri / Google Assistant integration | SiriKit App Intents / Google App Actions | Medium |

### Advanced

| Feature | Technology | Effort |
|---------|-----------|--------|
| Bluetooth scale (web) | Web Bluetooth API (Chrome/Android only) | Low (with caveats) |
| Stain detection from photos | Custom trained model on fabric stain dataset | High |
| AI garment itemization (NoScrubs-style) | Computer vision pipeline per garment | High |
| Visual weight estimation | Visual regression model (laundry-specific dataset needed) | High |
| Alexa skill | Amazon ASK | Medium |

---

## Sources

- [OpenAI Realtime API announcement](https://openai.com/index/introducing-the-realtime-api/)
- [OpenAI Realtime API WebSocket docs](https://developers.openai.com/api/docs/guides/realtime-websocket)
- [Whisper vs Google STT vs Amazon Transcribe (Gladia)](https://www.gladia.io/blog/openai-whisper-vs-google-speech-to-text-vs-amazon-transcribe)
- [Whisper vs Google STT comparison (Sotto)](https://sotto.to/blog/whisper-vs-google-speech)
- [NLP-based food ordering chatbot (IJSRA paper)](https://ijsra.net/sites/default/files/fulltext_pdf/IJSRA-2025-1313.pdf)
- [AI phone assistants NLP for restaurants (Bytes AI)](https://trybytes.ai/blogs/how-ai-phone-assistants-use-nlp-for-menus)
- [How to build AI voice apps (Carl Lippert)](https://www.carllippert.com/blog/how-to-build-ai-voice-apps-in-2024-2)
- [Laundrapp Alexa skill case study (Amazon Developer)](https://developer.amazon.com/blogs/alexa/post/77c76619-f702-4276-b30a-9a4814161bcb/with-laundrapp-s-alexa-skill-customers-simply-ask-alexa-to-take-care-of-the-laundry)
- [Confirmation dialog UX (Nielsen Norman Group)](https://www.nngroup.com/articles/confirmation-dialog/)
- [Laundry image classification 99.5% accuracy (James Braza / Stanford)](https://jamesbraza.com/projects/laundry-classification/)
- [Google Cloud Vision API style detection](https://cloud.google.com/blog/products/ai-machine-learning/introducing-style-detection-for-google-cloud-vision-api)
- [AI fabric defect detection (Brightpoint AI)](https://www.brightpoint.ai/post/ai-based-defect-detection-in-textile-and-garment-manufacturing)
- [AI textile defect detection (Indian Textile Magazine)](https://www.indiantextilemagazine.in/it-is-time-for-ai-computer-vision-to-detect-fabric-defects/)
- [LG AI laundry treatment patent](https://patents.google.com/patent/EP3957791A1/en)
- [Visual weight estimation from photos (Edge Impulse)](https://www.edgeimpulse.com/blog/estimate-weight-from-a-photo-using-visual-regression-in-edge-impulse/)
- [Food weight estimation from 2D images (arXiv)](https://arxiv.org/html/2405.16478v1)
- [NoScrubs AI-powered laundry (SMDP)](https://www.smdp.com/ai-powered-laundry-service-noscrubs-launches-in-santa-monica-with-4-hour-turnaround/)
- [BLE weighing scales — protocols & GATT (WSI Scales)](https://wsi-scales.com/index.php/ble-weighing-scales/)
- [Bluetooth Weight Scale Service specification (Bluetooth SIG)](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/WSS_v1.0.1/out/en/index-en.html)
- [Web Bluetooth API implementation guide (Stormotion)](https://stormotion.io/blog/web-ble-implementation/)
- [Web Bluetooth API browser compatibility (TestMu AI)](https://www.testmuai.com/web-technologies/web-bluetooth/)
- [Web Bluetooth quick peek (Notificare)](https://notificare.com/blog/2021/09/24/Quick-peek-into-the-Web-Bluetooth-API/)
- [Industrial scale calibration (BizAutom)](https://bizautom.com/how-to-ensure-accurate-readings-with-industrial-smart-scale-calibration/)
- [Proof of delivery apps overview (Track-POD)](https://www.track-pod.com/blog/proof-of-delivery-apps/)
- [Timemark GPS delivery photos](https://www.timemark.com/solutions/proof-of-delivery-photo)
- [Turns laundromat software 2024 features](https://www.turnsapp.com/recap)
- [AI chatbot for dry cleaning (Widget Chat)](https://widget-chat.com/blog/dry-cleaning-laundry-chatbot-guide/)
- [WhatsApp bot for laundry (Fabklean)](https://fabklean.com/blogs/introducing-the-worlds-first-whatsapp-bot-for-laundry-businesses/)
- [AI voice assistant for laundry (Voice.ai)](https://voice.ai/hub/ai-voice-agents/laundry/)
- [SiriKit / Apple Intelligence for developers (TechCrunch)](https://techcrunch.com/2024/06/10/apple-brings-apple-intelligence-to-developers-via-sirikit-and-app-intents/)
- [SiriKit integration guide (Clouddevs)](https://clouddevs.com/swift/sirikit/)
- [Google App Actions codelab](https://codelabs.developers.google.com/codelabs/appactions)
- [Google App Actions developer page](https://developers.google.com/assistant/app)
- [Instacart/DoorDash/Uber ChatGPT integration (LinkedIn)](https://www.linkedin.com/posts/matthewvangilder_walmart-openai-partner-for-purchases-in-activity-7383969602898382848-5tXb)
- [GE SmartHQ AI laundry assistant](https://pressroom.geappliances.com/news/ge-appliances-transforms-daily-life-with-ai-powered-kitchen-laundry-and-shopping-innovations)
- [Samsung Bespoke AI Laundry](https://news.samsung.com/uk/samsungs-new-bespoke-ai-laundry-with-ai-home-enables-smarter-more-efficient-laundry-care)
- [Hampr laundry service how it works](https://www.tryhampr.com/how-it-works/)
- [Miele Alexa voice assistant for laundry](https://www.mieleusa.com/c/voice-assistance-3646.htm)
