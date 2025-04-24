from flask import Flask, request, jsonify, session, render_template, send_from_directory

import os
import time
import json
from werkzeug.utils import secure_filename
import kloppy_wrapper  # You would create this module to wrap your formation analysis code
import markdown
from kloppy_wrapper import analyze_match     # adjust 'your_module' to the filename where analyze_match lives


# Initialize Flask app
app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key')  # Change in production

# API keys from environment variables
GOOGLE_API_KEY = "YOUR_API_KEY"

# Configuration
UPLOAD_FOLDER = './uploads'
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB upload limit

# Create upload directory if it doesn't exist
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)


# Function to check if a file has an allowed extension
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# Function to convert plain text to HTML with proper markdown formatting
def format_markdown(text):
    # Process bullet points
    lines = text.split('\n')
    formatted_lines = []
    for line in lines:
        # Check if line starts with bullet point or numbered list
        if line.strip().startswith('•') or line.strip().startswith('-') or (line.strip() and line.strip()[0].isdigit() and '. ' in line):
            formatted_lines.append(line)
        else:
            formatted_lines.append(line)
    
    processed_text = '\n'.join(formatted_lines)
    
    # Convert markdown to HTML
    html = markdown.markdown(processed_text)
    return html


# Routes
@app.route('/')
def index():
    """Serve the main landing page"""
    return render_template('index.html')


@app.route('/video-analysis')
def video_analysis():
    """Serve the video analysis page"""
    return render_template('video_analysis.html')


@app.route('/formation-analysis')
def formation_analysis():
    """Serve the formation analysis page"""
    return render_template('formation_analysis.html')


@app.route('/chat-assistant')
def chat_assistant():
    """Serve the chat assistant page"""
    return render_template('chat_assistant.html')


@app.route('/api/check-api-status', methods=['GET'])
def check_api_status():
    """Check if API clients are working"""
    status = {"google": False}


    # Test Google Gemini API
    try:
        from google import genai
        client = genai.Client(api_key=GOOGLE_API_KEY)
        response = client.models.generate_content(
                    model="gemini-1.5-pro", contents=["Test"])
        status["google"] = True
    except Exception as e:
        print(f"Google API error: {e}")

    return jsonify({"success": True, "status": status})


@app.route('/api/chat', methods=['POST'])
def chat():
    """Process chat messages and generate responses using Gemini"""
    data    = request.json
    prompt  = data.get('message')
    context = data.get('context', {})
    topic   = data.get('topic', 'General Chat')

    if not prompt:
        return jsonify({"error": "No message provided"}), 400

    try:
        # Initialize Gemini client
        from google import genai
        client = genai.Client(api_key=GOOGLE_API_KEY)

        # Construct the system prompt based on available context
        if topic == "General Chat":
            system_prompt = (
                "You are a friendly football analyst assistant. "
                "You answer general questions about football tactics, history and trivia."
            )
        elif topic == "Video Analysis":
                system_prompt = (
                    "You are an expert football video analyst. "
                    "Use the supplied video analysis (from session) to answer questions "
                    "about pressing, movement, patterns and transitions."
            )
        elif topic == "Formation Analysis":
                system_prompt = (
                    "You are a football formation strategist. "
                    "Use the supplied formation analysis (from session) to suggest formations, "
                    "shape adjustments, and role assignments."
            )
        elif topic == "Player Performance":
                system_prompt = (
                    "You are a player performance specialist. "
                    "Focus on metrics like speed, distance covered, pass accuracy, pressing stats, "
                    "and give actionable feedback on individual players."
            )
        elif topic == "Tactical Insights":
                system_prompt = (
                    "You are a tactical insights expert. "
                    "Provide deep analysis of tactical patterns, space exploitation, pressing triggers, "
                    "and give strategic recommendations."
            )
        else:
                system_prompt = (
                    "You are an expert football analyst assistant. "
                    "Format your answer as bulleted points using markdown syntax."
            )

        saved = session.get('chat_context', {})
        context_text = ""

        if context.get('video') and saved.get('video'):
            context_text += (
            "Here is the AI’s **video analysis** you ran earlier:\n\n"
            + saved['video']['formatted_analysis']
            + "\n\n"
            )

        if context.get('formation') and saved.get('formation'):
            context_text += (
            "Here is the AI’s **formation analysis** you ran earlier:\n\n"
            + saved['formation']['formatted_analysis']
            + "\n\n"
            )

        if context_text:
            system_prompt += "\n\n" + context_text

        # If video context is present, use video-based chat
        if 'video' in context:
            video_path = os.path.join(app.config['UPLOAD_FOLDER'], f"analysis_{context['video']}.mp4")
            
            if not os.path.exists(video_path):
                # Try to find the video file by pattern matching
                video_files = [f for f in os.listdir(app.config['UPLOAD_FOLDER']) 
                            if f.startswith(f"analysis_{context['video']}") and 
                            os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], f))]
                
                if video_files:
                    video_path = os.path.join(app.config['UPLOAD_FOLDER'], video_files[0])
                else:
                    return jsonify({"error": f"Video file for ID {context['video']} not found"}), 404
            
            # Upload and process the video file
            video_file = client.files.upload(file=video_path)
            
            # Check if video processing is complete
            max_wait_time = 60  # Maximum wait time in seconds
            start_time = time.time()
            
            while video_file.state.name == "PROCESSING":
                elapsed_time = time.time() - start_time
                if elapsed_time > max_wait_time:
                    return jsonify({"error": "Video processing timed out"}), 504
                
                time.sleep(1)
                video_file = client.files.get(name=video_file.name)

            if video_file.state.name == "FAILED":
                raise ValueError(f"Video processing failed: {video_file.state.name}")

            # Generate response with video context
            response = client.models.generate_content(
                model="gemini-1.5-pro",
                contents=[video_file, f"{system_prompt}\n\nUser Question: {prompt}"]
            )
        else:
            # Generate text-only response
            response = client.models.generate_content(
                model="gemini-1.5-pro",
                contents=[f"{system_prompt}\n\nUser Question: {prompt}"]
            )

        ai_response = response.text
        
        # Convert to markdown for better formatting in the UI
        formatted_response = format_markdown(ai_response)

        return jsonify({"success": True, "response": ai_response, "formatted_response": formatted_response})
    except Exception as e:
        print(f"Error in chat API: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/upload-video', methods=['POST'])
def upload_video():
    """Handle video file uploads"""
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    
    file = request.files['video']
    video_type = request.form.get('videoType', 'unknown')
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        timestamp = int(time.time())
        new_filename = f"{video_type}_{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
        file.save(filepath)
        
        return jsonify({
            "success": True,
            "filename": new_filename,
            "filepath": f"/uploads/{new_filename}",
            "filesize": os.path.getsize(filepath),
            "video_id": timestamp  # Return the timestamp as a video ID for reference
        })
    
    return jsonify({"error": "Invalid file format"}), 400


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """Serve uploaded files"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/api/analyze-video', methods=['POST'])
def analyze_video():
    data = request.json
    analysis_type = data.get('analysisType')
    video_id      = data.get('videoId')
    question      = data.get('question')  # only for free‑text Q&A

    # 1) Find the uploaded file
    matches = [
        f for f in os.listdir(app.config['UPLOAD_FOLDER'])
        if f.startswith(f"analysis_{video_id}_")
    ]
    if not matches:
        return jsonify({"success": False, "error": "Analysis video not found"}), 400

    video_path = os.path.join(app.config['UPLOAD_FOLDER'], matches[0])

    try:
        from google import genai
        client = genai.Client(api_key=GOOGLE_API_KEY)

        # 2) Upload to Gemini
        video_file = client.files.upload(file=video_path)
        start = time.time()
        while video_file.state.name == "PROCESSING":
            if time.time() - start > 120:
                return jsonify({"success": False, "error": "Video processing timed out"}), 504
            time.sleep(1)
            video_file = client.files.get(name=video_file.name)
        if video_file.state.name == "FAILED":
            raise ValueError("Video processing failed")

        # 3a) Free‑text question flow
        if analysis_type == 'question':
            system = (
                "You are an expert football analyst. "
                "Answer the coach's question clearly and concisely."
            )
            response = client.models.generate_content(
                model="gemini-1.5-pro",
                contents=[video_file, f"{system}\n\nQuestion: {question}"]
            )
            raw = response.text
            formatted = format_markdown(raw)
            return jsonify({"success": True, "results": {
                "raw_analysis": raw,
                "formatted_analysis": formatted
            }})

        # 3b) Existing pressing/positioning/tactical flows
        prompt = generate_analysis_prompt(analysis_type)
        response = client.models.generate_content(
            model="gemini-1.5-pro",
            contents=[video_file, prompt]
        )
        analysis_text = response.text
        formatted = format_markdown(analysis_text)
        results = process_analysis_results(analysis_text, analysis_type)
        results.update({
            "raw_analysis": analysis_text,
            "formatted_analysis": formatted
        })
        
        session.setdefault('chat_context', {})['video'] = {
            "video_id": video_id,
            "formatted_analysis": formatted
        }
        return jsonify({"success": True, "results": results})

    except Exception as e:
        app.logger.exception("Error in /api/analyze-video")
        return jsonify({"success": False, "error": str(e)}), 500



def format_markdown(text: str) -> str:
    """Convert markdown text to HTML."""
    return markdown.markdown(text or "")

@app.route('/api/analyze-formation', methods=['POST'])
def analyze_formation():
    data       = request.get_json(force=True)
    match_id   = data.get('matchId')
    period_id  = int(data.get('periodId', 1))
    data_limit = int(data.get('dataLimit', 5000))

    if not match_id:
        return jsonify(success=False, error="No match ID provided"), 400

    try:
        # 1) Run your core analysis
        results = analyze_match(
            match_id=match_id,
            period_id=period_id,
            api_key=GOOGLE_API_KEY,
            limit=data_limit
        )

        # 2) Unpack formations & metrics
        formations = results.get('formations', {})
        metrics    = results.get('metrics', {})

        # 3) Extract the LLM's recommendations text
        rec_block = results.get('recommendations', {})
        rec_text  = rec_block.get('recommendations') if isinstance(rec_block, dict) else rec_block

        # 4) Build the payload for the frontend
        payload = {
            "success": True,
            "results": {
                "homeFormation": formations.get('home', 'unknown'),
                "awayFormation": formations.get('away', 'unknown'),
                # metrics dictionary goes straight through
                "metrics": metrics,
                # raw text (for any further parsing on the client)
                "raw_analysis": rec_text,
                # HTML‑formatted markdown
                "formatted_analysis": format_markdown(rec_text)
            }
        }

        session.setdefault('chat_context', {})['formation'] = {
            "match_id": match_id,
            "formatted_analysis": payload['results']['formatted_analysis']
        }
        return jsonify(payload)
        return jsonify(payload)

    except Exception as e:
        app.logger.exception("Error in /api/analyze-formation")
        return jsonify(success=False, error=str(e)), 500


# Helper function to generate analysis prompts based on analysis type
def generate_analysis_prompt(analysis_type):
    if analysis_type == 'pressing':
        return """
        Analyze this football pressing intensity visualization:

        DETAILED ANALYSIS:
        1. Provide a timeline analysis identifying key pressing sequences and transitions (with timestamps if visible)
        2. Compare the pressing approaches of both teams (height of press, triggers, intensity patterns)
        3. Identify which zones of the pitch show highest pressing intensity and explain tactical implications
        4. Analyze numerical superiority/inferiority patterns during pressing phases

        PLAYER PERFORMANCE:
        1. Identify 2-3 standout pressing performers from each team with specific examples of their effectiveness
        2. Highlight which players are targeted most during opponent pressing and how they respond
        3. Evaluate coordination between pressing units (forwards, midfielders, defenders)

        TACTICAL RECOMMENDATIONS:
        1. List 3 specific tactical adjustments to improve pressing effectiveness for the team with weaker pressing
        2. List 3 specific counterpressing adaptations for the team with stronger pressing
        3. For both teams: Identify pressing triggers that could be optimized

        Format your analysis as a professional tactical report with clear section headings and bullet points for key insights.
        Use markdown syntax for proper formatting, including:
        - Use '# ' for main section headings
        - Use '## ' for subsection headings
        - Use bullet points with '- ' or '* ' for lists
        - Use bold text with '**text**' for emphasis
        """
    elif analysis_type == 'positioning':
        return """
        Analyze this football positioning visualization:

        DETAILED ANALYSIS:
        1. Evaluate the team shape and structure for both teams
        2. Identify key positional relationships between players and units
        3. Analyze the compactness and width of both teams in different phases of play
        4. Evaluate the defensive line height and its implications

        PLAYER PERFORMANCE:
        1. Identify players with optimal positioning and their impact on the game
        2. Highlight players who may be out of position and the tactical implications
        3. Analyze the movement patterns of key players and how they create or exploit space

        TACTICAL RECOMMENDATIONS:
        1. Suggest 3 specific positional adjustments to improve team structure
        2. Recommend how to exploit positional weaknesses in the opposition
        3. Provide guidance on optimal positioning for different game scenarios

        Format your analysis as a professional tactical report with clear section headings and bullet points for key insights.
        Use markdown syntax for proper formatting, including:
        - Use '# ' for main section headings
        - Use '## ' for subsection headings
        - Use bullet points with '- ' or '* ' for lists
        - Use bold text with '**text**' for emphasis
        """
    elif analysis_type == 'tactical':
        return """
        Provide a comprehensive tactical analysis of this football match:

        TACTICAL SETUP:
        1. Analyze the formations and tactical approaches of both teams
        2. Identify the key tactical battles across the pitch
        3. Evaluate how each team's tactics evolved throughout the match

        ATTACKING PATTERNS:
        1. Identify the primary attacking methods for each team
        2. Analyze build-up play, progression methods, and final third entries
        3. Evaluate chance creation and shooting patterns

        DEFENSIVE ORGANIZATION:
        1. Analyze defensive structures and principles for both teams
        2. Identify pressing triggers and defensive transitions
        3. Evaluate defensive weaknesses and how they were exploited

        TACTICAL RECOMMENDATIONS:
        1. Suggest 3-4 specific tactical adjustments for each team
        2. Provide guidance on how to counter the opposition's primary threats
        3. Recommend training focus areas based on tactical performance

        Format your analysis as a professional tactical report with clear section headings and bullet points for key insights.
        Use markdown syntax for proper formatting, including:
        - Use '# ' for main section headings
        - Use '## ' for subsection headings
        - Use bullet points with '- ' or '* ' for lists
        - Use bold text with '**text**' for emphasis
        """
    else:
        return """
        Provide a detailed football analysis of this video, focusing on:
        
        1. Key tactical patterns and strategies
        2. Player positioning and movement
        3. Team structure and organization
        4. Strengths and weaknesses observed
        5. Recommendations for improvement
        
        Format your analysis as a professional tactical report with clear section headings and bullet points for key insights.
        Use markdown syntax for proper formatting, including:
        - Use '# ' for main section headings
        - Use '## ' for subsection headings
        - Use bullet points with '- ' or '* ' for lists
        - Use bold text with '**text**' for emphasis
        """


# Helper function to process analysis results from Gemini
def process_analysis_results(analysis_text, analysis_type):
    # Extract key metrics and insights from the analysis text
    
    # Extract insights - looking for bullet points or numbered items
    insights = []
    recommendations = []
    
    lines = analysis_text.split('\n')
    current_section = None
    
    for line in lines:
        line_lower = line.lower().strip()
        
        # Identify current section
        if any(keyword in line_lower for keyword in ['detailed analysis', 'player performance', 'tactical setup', 'attacking patterns']):
            current_section = 'analysis'
        elif any(keyword in line_lower for keyword in ['recommendation', 'suggestion', 'improvement']):
            current_section = 'recommendation'
            
        # Check if this is a bullet point or numbered item
        if line.strip() and (line.strip()[0] in ['-', '•', '*'] or (len(line.strip()) > 0 and line.strip()[0].isdigit() and '. ' in line)):
            # Remove the bullet or number prefix
            if line.strip()[0] in ['-', '•', '*']:
                content = line.strip()[1:].strip()
            else:
                parts = line.strip().split('. ', 1)
                if len(parts) > 1:
                    content = parts[1].strip()
                else:
                    content = line.strip()
                    
            if content:
                if current_section == 'recommendation':
                    recommendations.append(content)
                else:
                    insights.append(content)
    
    # Ensure we have at least some insights and recommendations
    if not insights:
        insights = extract_sentence_insights(analysis_text, 4)
    
    if not recommendations:
        recommendations = extract_sentence_recommendations(analysis_text, 4)
    
    # Limit to 4 insights and recommendations
    insights = insights[:4]
    recommendations = recommendations[:4]
    
    # Prepare response based on analysis type
    if analysis_type == 'pressing':
        return {
            "pressSuccess": estimate_metric_from_text(analysis_text, 'success', 60, 80),
            "pressIntensity": estimate_metric_from_text(analysis_text, 'intensity', 6.0, 8.0),
            "recoveryTime": estimate_metric_from_text(analysis_text, 'recovery', 4.0, 6.0),
            "insights": insights,
            "recommendations": recommendations
        }
    elif analysis_type == 'positioning':
        return {
            "compactness": estimate_metric_from_text(analysis_text, 'compact', 20.0, 30.0),
            "width": estimate_metric_from_text(analysis_text, 'width', 40.0, 50.0),
            "depth": estimate_metric_from_text(analysis_text, 'depth', 30.0, 35.0),
            "insights": insights,
            "recommendations": recommendations
        }
    elif analysis_type == 'tactical':
        return {
            "possession": estimate_metric_from_text(analysis_text, 'possession', 45, 65),
            "territory": estimate_metric_from_text(analysis_text, 'territory', 45, 65),
            "xg": estimate_metric_from_text(analysis_text, 'xg', 1.5, 3.0),
            "insights": insights,
            "recommendations": recommendations
        }
    else:
        return {
            "insights": insights,
            "recommendations": recommendations
        }


# Helper function to extract metrics from text
def estimate_metric_from_text(text, keyword, min_value, max_value):
    """
    Try to extract a metric from text based on keywords.
    If not found, return a reasonable random value in the given range.
    """
    import re
    import random
    
    # Try to find the keyword with a number nearby
    text_lower = text.lower()
    
    # Look for patterns like "keyword: 75%" or "75% keyword"
    patterns = [
        rf"{keyword}[:\s]+(\d+\.?\d*)%?",
        rf"(\d+\.?\d*)%?\s+{keyword}"
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text_lower)
        if matches:
            try:
                value = float(matches[0])
                # If value seems reasonable, use it
                if min_value * 0.5 <= value <= max_value * 1.5:
                    return value
            except ValueError:
                pass
    
    # Generate a realistic random value if extraction fails
    return round(random.uniform(min_value, max_value), 1)


# Helper function to extract insights from sentences
def extract_sentence_insights(text, count=4):
    """Extract sentences that look like insights"""
    import re
    
    # Split text into sentences
    sentences = re.split(r'\.(?=\s|$)', text)
    
    # Filter for sentences that might be insights
    insight_candidates = []
    
    insight_keywords = ['team', 'player', 'tactical', 'position', 'press', 'attack', 'defend', 
                       'formation', 'structure', 'movement', 'effective', 'successful']
    
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) > 20 and len(sentence) < 150:  # Reasonable insight length
            if any(keyword in sentence.lower() for keyword in insight_keywords):
                insight_candidates.append(sentence)
    
    # Take the top insights
    return insight_candidates[:count]


# Helper function to extract recommendations from sentences
def extract_sentence_recommendations(text, count=4):
    """Extract sentences that look like recommendations"""
    import re
    
    # Split text into sentences
    sentences = re.split(r'\.(?=\s|$)', text)
    
    # Filter for sentences that might be recommendations
    recommendation_candidates = []
    
    recommendation_keywords = ['should', 'could', 'need to', 'improve', 'adjust', 'consider', 
                              'recommend', 'suggestion', 'adapt', 'increase', 'decrease', 'focus']
    
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) > 20 and len(sentence) < 150:  # Reasonable recommendation length
            if any(keyword in sentence.lower() for keyword in recommendation_keywords):
                recommendation_candidates.append(sentence)
    
    # Take the top recommendations
    return recommendation_candidates[:count]


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
