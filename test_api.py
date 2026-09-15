import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key loaded: {'Yes' if api_key else 'No'}")

try:
    from google import genai
    print("google-genai imported successfully")
    client = genai.Client(api_key=api_key)
    
    # Try 1.5 flash
    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents='Say hi',
        )
        print("gemini-1.5-flash SUCCESS:", response.text)
    except Exception as e:
        print("gemini-1.5-flash ERROR:", e)

    # Try 1.0 pro
    try:
        response = client.models.generate_content(
            model='gemini-1.0-pro',
            contents='Say hi',
        )
        print("gemini-1.0-pro SUCCESS:", response.text)
    except Exception as e:
        print("gemini-1.0-pro ERROR:", e)

except Exception as e:
    print("google-genai import error:", e)

try:
    import google.generativeai as old_genai
    print("google.generativeai imported successfully")
    old_genai.configure(api_key=api_key)
    model = old_genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content("Say hi")
    print("OLD SDK gemini-1.5-flash SUCCESS:", response.text)
except Exception as e:
    print("OLD SDK ERROR:", e)
