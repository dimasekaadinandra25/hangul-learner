# Records one sentence with edge-tts and saves when each word is said, for word highlighting in the app.
# Usage: python tools/tts_words.py <text> <voice> <rate> <out.mp3> <out.json>
# The json is [[start ms, duration ms, word], ...]. Used by gen-audio.js for story and conversation lines.
import asyncio, json, sys
import edge_tts

async def main(text, voice, rate, mp3, out):
    words = []
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":  # offset and duration come in 100 ns units
                words.append([round(chunk["offset"] / 1e4), round(chunk["duration"] / 1e4), chunk["text"]])
    with open(out, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)

asyncio.run(main(*sys.argv[1:6]))
