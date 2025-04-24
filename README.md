# TakiTech

A comprehensive web application for football (soccer) match analysis, powered by AI tools and data visualization.

## Features

- **Video Analysis**: Upload and analyze football match videos using Google Gemini AI
- **Formation Analysis**: Analyze team formations and player positioning
- **Chat Assistant**: Interact with an AI assistant specialized in football analysis
- **Multiple Analysis Types**:
  - Pressing analysis
  - Positioning analysis
  - Tactical analysis
  - Free-text Q&A about match footage

## Requirements

- Python 3.7+
- Flask
- Google Gemini API key
- Kloppy (for formation analysis)
- Additional Python packages: markdown, werkzeug

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/football-analysis-platform.git
   cd football-analysis-platform
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Create an uploads directory:
   ```
   mkdir uploads
   ```

## Configuration

1. Set environment variables:
   ```
   export SECRET_KEY="your-secret-key"
   ```

2. Configure Google Gemini API key in app.py or as an environment variable.

## Usage

1. Start the Flask server:
   ```
   python app.py
   ```

2. Open your browser and navigate to `http://localhost:5000`

3. Use the platform's features:
   - Upload video files for analysis
   - Analyze formations using match data
   - Chat with the football analysis assistant

## API Endpoints

- `/api/upload-video`: Upload video files for analysis
- `/api/analyze-video`: Process video with different analysis types
- `/api/analyze-formation`: Analyze team formations
- `/api/chat`: Interact with the AI assistant
- `/api/check-api-status`: Check if API services are available

## Project Structure

- `app.py`: Main Flask application
- `kloppy_wrapper.py`: Wrapper for formation analysis using Kloppy
- `templates/`: HTML templates for the web interface
- `static/`: CSS, JavaScript, and other static assets
- `uploads/`: Directory for storing uploaded videos
