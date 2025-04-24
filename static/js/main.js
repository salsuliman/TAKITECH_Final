let originalVideoId = null;
let analysisVideoId = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
    if (document.getElementById('api-status')) {
        checkApiStatus();
    }
    console.log('TakiTech Football Analysis Platform initialized');
});

function initApp() {
    showLoading('Initializing application...');
    setTimeout(hideLoading, 1000);
}

async function checkApiStatus() {
    try {
        const res = await fetch('/api/check-api-status');
        const data = await res.json();
        if (data.success) {
            document.getElementById('api-status').innerHTML = `
                <span class="${data.status.openai ? 'status-ok' : 'status-error'}">
                  OpenAI: ${data.status.openai ? 'OK' : 'Error'}
                </span> |
                <span class="${data.status.google ? 'status-ok' : 'status-error'}">
                  Google: ${data.status.google ? 'OK' : 'Error'}
                </span>
            `;
        }
    } catch (err) {
        console.error('Error checking API status:', err);
        showAlert('Error checking API status', 'error');
    }
}

function setupEventListeners() {
    document.getElementById('demo-btn')?.addEventListener('click', openDemoModal);
    document.getElementById('request-demo-btn')?.addEventListener('click', openDemoModal);
    document.getElementById('demo-form')?.addEventListener('submit', e => {
        e.preventDefault();
        handleDemoFormSubmission();
    });
    document.querySelectorAll('.close-modal, .modal-close-btn')
        .forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelectorAll('.modal')
        .forEach(modal => modal.addEventListener('click', e => {
            if (e.target === modal) closeModal();
        }));
    setupPageSpecificListeners();
}

function setupPageSpecificListeners() {
    if (document.querySelector('.video-analysis-container')) {
        setupVideoAnalysisListeners();
    }
    if (document.querySelector('.formation-analysis-container')) {
        setupFormationAnalysisListeners();
    }
    if (document.querySelector('.chat-container')) {
        setupChatAssistantListeners();
    }
}

// --- VIDEO ANALYSIS LISTENERS & UPLOAD HANDLING ---

function setupVideoAnalysisListeners() {
    setupVideoUploadListeners(
      document.getElementById('original-video-upload'),
      document.getElementById('original-video-file'),
      'original'
    );
    setupVideoUploadListeners(
      document.getElementById('analysis-video-upload'),
      document.getElementById('analysis-video-file'),
      'analysis'
    );
    document.getElementById('run-pressing-analysis')
        ?.addEventListener('click', () => runVideoAnalysis('pressing'));
    // (add the other analysis buttons here if needed)

    document.getElementById('question-form')
        ?.addEventListener('submit', e => {
            e.preventDefault();
            askVideoQuestion();
        });
}

function setupVideoUploadListeners(uploadContainer, fileInput, videoType) {
    if (!uploadContainer || !fileInput) return;
    uploadContainer.addEventListener('dragover', e => {
        e.preventDefault();
        uploadContainer.classList.add('dragover');
    });
    uploadContainer.addEventListener('dragleave', () => {
        uploadContainer.classList.remove('dragover');
    });
    uploadContainer.addEventListener('drop', e => {
        e.preventDefault();
        uploadContainer.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    uploadContainer.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleVideoUpload(videoType);
    });
}

async function handleVideoUpload(videoType) {
    const fileInput    = document.getElementById(`${videoType}-video-file`);
    const uploadStatus = document.getElementById(`${videoType}-upload-status`);
    const videoDisplay = document.getElementById(`${videoType}-video-display`);
    const file         = fileInput.files[0];

    // Validate size & type
    if (file.size > 100 * 1024 * 1024) {
        uploadStatus.textContent = 'Error: Max 100MB';
        uploadStatus.className = 'upload-status error';
        return;
    }
    const allowed = ['video/mp4','video/quicktime','video/x-msvideo'];
    if (!allowed.includes(file.type)) {
        uploadStatus.textContent = 'Error: Only MP4 MOV AVI';
        uploadStatus.className = 'upload-status error';
        return;
    }

    try {
        uploadStatus.textContent = 'Uploading…';
        uploadStatus.className = 'upload-status uploading';
        const form = new FormData();
        form.append('video', file);
        form.append('videoType', videoType);
        const res = await fetch('/api/upload-video', { method:'POST', body: form });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Upload failed');

        // **Store returned ID**
        if (videoType === 'original') originalVideoId = data.video_id;
        else if (videoType === 'analysis') analysisVideoId = data.video_id;

        uploadStatus.textContent = `Uploaded: ${data.filename}`;
        uploadStatus.className = 'upload-status success';
        videoDisplay.innerHTML = `
            <div class="video-container">
              <video controls><source src="${data.filepath}" type="video/mp4"></video>
              <button class="remove-video-btn" data-video-type="${videoType}">✕</button>
            </div>
        `;
        videoDisplay.querySelector('.remove-video-btn')
            .addEventListener('click', e => {
                e.stopPropagation();
                removeVideoFile(videoType);
            });

        document.getElementById(`${videoType}-video-upload`).classList.add('hidden');
        showAlert(`${videoType.charAt(0).toUpperCase()+videoType.slice(1)} video uploaded`, 'success');
    } catch (err) {
        console.error(`Error uploading ${videoType}:`, err);
        uploadStatus.textContent = `Error: ${err.message}`;
        uploadStatus.className = 'upload-status error';
        showAlert(`Error uploading video: ${err.message}`, 'error');
    } finally {
        updateAnalysisOptions();
    }
}

// Run video analysis (pressing / positioning / tactical)
async function runVideoAnalysis(analysisType) {
    if (!analysisVideoId) {
        return showAlert('Please upload an analysis overlay video first', 'warning');
    }
    
    showLoading(`Running ${analysisType} analysis with AI...`);

    try {
        const response = await fetch('/api/analyze-video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                analysisType: analysisType,
                videoId: analysisVideoId     // << include the overlay video ID
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }

        // Pass along the formatted_analysis from the backend
        displayAnalysisResults(
            data.results,
            analysisType,
            data.results.formatted_analysis
        );

        showAlert(
            `${analysisType.charAt(0).toUpperCase() + analysisType.slice(1)} analysis completed successfully`,
            'success'
        );
    } catch (error) {
        console.error('Error running video analysis:', error);
        showAlert(`Error running analysis: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}


function removeVideoFile(videoType) {
    if (videoType === 'original')   originalVideoId = null;
    else if (videoType === 'analysis') analysisVideoId = null;

    document.getElementById(`${videoType}-video-display`).innerHTML = '';
    document.getElementById(`${videoType}-upload-status`).textContent = '';
    document.getElementById(`${videoType}-video-upload`).classList.remove('hidden');
    document.getElementById(`${videoType}-video-file`).value = '';
    showAlert(`${videoType.charAt(0).toUpperCase()+videoType.slice(1)} video removed`, 'info');
    updateAnalysisOptions();
}

// Only show the analysis options & question form once both videos are uploaded
function updateAnalysisOptions() {
    const ok = !!originalVideoId && !!analysisVideoId;
    document.getElementById('analysis-options')
        .classList.toggle('hidden', !ok);
    document.querySelector('.question-form')
        .classList.toggle('hidden', !ok);
}

// **New**: Ask a free‑text question about the overlay video
async function askVideoQuestion() {
    const qIn = document.getElementById('question-input');
    const question = qIn.value.trim();
    if (!question) return showAlert('Please enter a question','warning');
    if (!analysisVideoId) return showAlert('Upload overlay video first','warning');

    showLoading('Processing your question with AI…');
    try {
        const res = await fetch('/api/analyze-video', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                analysisType: 'question',
                videoId: analysisVideoId,
                question: question
            })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error||'Unknown error');

        // Prepend Q&A
        const container = document.getElementById('analysis-results');
        container.innerHTML = `
          <div class="question-answer">
            <div class="question"><strong>Q:</strong> ${question}</div>
            <div class="answer"><strong>A:</strong> ${json.results.formatted_analysis}</div>
          </div>
          ${container.innerHTML}
        `;
        qIn.value = '';
        showAlert('Question answered successfully','success');
    } catch (err) {
        console.error('Error asking question:', err);
        showAlert(`Error: ${err.message}`,'error');
    } finally {
        hideLoading();
    }
}

// Send chat message with real AI integration
function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.querySelector('.chat-messages');
    
    if (!chatInput || !chatMessages || !chatInput.value.trim()) return;
    
    const message = chatInput.value.trim();
    
    // Add user message to chat
    addChatMessage(message, 'user');
    
    // Clear input
    chatInput.value = '';
    
    // Process message
    processChatMessage(message);
}

function getSelectedTopic() {
    const active = document.querySelector('.topic.active span');
    return active ? active.textContent.trim() : 'General Chat';
  }
  
// Process chat message and get AI response
async function processChatMessage(message) {
    // Get context information
    const context = getChatContext();
    const topic = getSelectedTopic();
    
    try {
        showLoading('AI is thinking...');
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                message,
                context,
                topic
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Add AI response to chat
            addChatMessage(data.response, 'bot');
        } else {
            showAlert(`Error: ${data.error}`, 'error');
            // Add error message to chat
            addChatMessage('Sorry, I encountered an error processing your request. Please try again.', 'bot');
        }
    } catch (error) {
        console.error('Error processing chat message:', error);
        showAlert(`Error: ${error.message || 'Unknown error'}`, 'error');
        // Add error message to chat
        addChatMessage('Sorry, I encountered an error processing your request. Please try again.', 'bot');
    } finally {
        hideLoading();
    }
}

// Get chat context from selected options
function getChatContext() {
    const context = {};
    
    const videoContextCheckbox = document.getElementById('video-context');
    const videoAnalysisSelect = document.getElementById('video-analysis-select');
    
    if (videoContextCheckbox && videoContextCheckbox.checked && videoAnalysisSelect && videoAnalysisSelect.value) {
        context.video = videoAnalysisSelect.value;
    }
    
    const formationContextCheckbox = document.getElementById('formation-context');
    const formationAnalysisSelect = document.getElementById('formation-analysis-select');
    
    if (formationContextCheckbox && formationContextCheckbox.checked && formationAnalysisSelect && formationAnalysisSelect.value) {
        context.formation = formationAnalysisSelect.value;
    }
    
    return context;
}

// Update context preview
function updateContextPreview() {
    const contextPreview = document.querySelector('.context-preview');
    const noContextMessage = document.querySelector('.no-context-message');
    const contextData = document.querySelector('.context-data');
    
    if (!contextPreview || !noContextMessage || !contextData) return;
    
    const context = getChatContext();
    
    if (Object.keys(context).length === 0) {
        noContextMessage.classList.remove('hidden');
        contextData.classList.add('hidden');
        return;
    }
    
    noContextMessage.classList.add('hidden');
    contextData.classList.remove('hidden');
    
    let contextHtml = '';
    
    if (context.video) {
        contextHtml += `<p><strong>Video Analysis:</strong> ${getAnalysisName(context.video)}</p>`;
    }
    
    if (context.formation) {
        contextHtml += `<p><strong>Formation Analysis:</strong> ${getAnalysisName(context.formation)}</p>`;
    }
    
    contextData.innerHTML = contextHtml;
}

// Get readable name for analysis ID
function getAnalysisName(analysisId) {
    const analysisMap = {
        'pressing-analysis-1': 'Pressing Analysis - Arsenal vs Chelsea',
        'positioning-analysis-1': 'Positioning Analysis - Barcelona vs Real Madrid',
        'formation-analysis-1': 'Formation Analysis - Arsenal vs Chelsea',
        'formation-analysis-2': 'Formation Analysis - Barcelona vs Real Madrid'
    };
    
    return analysisMap[analysisId] || analysisId;
}

// Add message to chat
function addChatMessage(message, type) {
    const chatMessages = document.querySelector('.chat-messages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    
    const avatarIcon = document.createElement('i');
    avatarIcon.className = type === 'user' ? 'fas fa-user' : 'fas fa-robot';
    avatarDiv.appendChild(avatarIcon);
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    bubbleDiv.appendChild(paragraph);
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    
    // Get current time
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    
    timeDiv.textContent = `${formattedHours}:${formattedMinutes} ${ampm}`;
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(bubbleDiv);
    messageDiv.appendChild(timeDiv);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Display video analysis results with full AI report visible immediately
function displayAnalysisResults(results, analysisType, fullAnalysis) {
    const analysisResults = document.getElementById('analysis-results');
    if (!analysisResults) return;
    
    let resultsHtml = '';
    
    switch (analysisType) {
        case 'pressing':
            resultsHtml = `
                <h3>Pressing Analysis Results</h3>
                <div class="results-section">
                    <div class="results-metrics">
                        <div class="metric">
                            <div class="metric-value">${results.pressSuccess}%</div>
                            <div class="metric-label">Success Rate</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${results.pressIntensity}</div>
                            <div class="metric-label">Intensity</div>
                        </div>
                    </div>
                    <div class="complete-analysis">
                        <h4>Complete AI Analysis</h4>
                        <div class="full-analysis-content">
                            ${fullAnalysis}
                        </div>
                    </div>
                </div>
            `;
            break;
            
        case 'positioning':
            resultsHtml = `
                <h3>Positioning Analysis Results</h3>
                <div class="results-section">
                    <div class="results-metrics">
                        <div class="metric">
                            <div class="metric-value">${results.compactness}m</div>
                            <div class="metric-label">Team Compactness</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${results.width}m</div>
                            <div class="metric-label">Effective Width</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${results.depth}m</div>
                            <div class="metric-label">Effective Depth</div>
                        </div>
                    </div>
                    
                    <div class="results-visualization">
                        <img src="${results.positionMapUrl || ''}" alt="Position Map">
                    </div>
                    
                    <div class="results-insights">
                        <h4>Key Insights</h4>
                        <ul>
                            ${results.insights.map(insight => `<li>${insight}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div class="complete-analysis">
                        <h4>Complete AI Analysis</h4>
                        <div class="full-analysis-content">
                            ${fullAnalysis}
                        </div>
                    </div>
                </div>
            `;
            break;
            
        case 'tactical':
            resultsHtml = `
                <h3>Tactical Analysis Results</h3>
                <div class="results-section">
                    <div class="results-metrics">
                        <div class="metric">
                            <div class="metric-value">${results.possession}%</div>
                            <div class="metric-label">Possession</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${results.territory}%</div>
                            <div class="metric-label">Territory</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${results.xg}</div>
                            <div class="metric-label">Expected Goals</div>
                        </div>
                    </div>
                    
                    <div class="results-visualization">
                        <img src="${results.tacticalMapUrl || ''}" alt="Tactical Analysis">
                    </div>
                    
                    <div class="results-insights">
                        <h4>Key Insights</h4>
                        <ul>
                            ${results.insights.map(insight => `<li>${insight}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div class="results-recommendations">
                        <h4>Tactical Recommendations</h4>
                        <ul>
                            ${results.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div class="complete-analysis">
                        <h4>Complete AI Analysis</h4>
                        <div class="full-analysis-content">
                            ${fullAnalysis}
                        </div>
                    </div>
                </div>
            `;
            break;
            
        default:
            resultsHtml = `
                <h3>Analysis Results</h3>
                <div class="results-section">
                    <div class="complete-analysis">
                        <h4>AI Analysis</h4>
                        <div class="full-analysis-content">
                            ${fullAnalysis}
                        </div>
                    </div>
                </div>
            `;
    }
    
    analysisResults.innerHTML = resultsHtml;

    
    // Add toggle functionality
    window.toggleFullAnalysis = function(id) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.toggle('hidden');
            const button = element.previousElementSibling.querySelector('button');
            if (button) {
                button.textContent = element.classList.contains('hidden') ? 
                    'Show Full AI Analysis' : 'Hide Full AI Analysis';
            }
        }
    };
}

// -- FORMATION ANALYSIS HANDLER --
async function runFormationAnalysis() {
    const matchId   = document.getElementById('match-id').value.trim();
    const periodId  = document.getElementById('period-id').value;
    const dataLimit = document.getElementById('data-limit').value;
    if (!matchId) {
      return showAlert('Please enter a Match ID','warning');
    }
  
    showLoading('Analyzing formation data with AI…');
    try {
      const res  = await fetch('/api/analyze-formation', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ matchId, periodId, dataLimit })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown error');
  
      const panel = document.getElementById('formation-results');
      panel.innerHTML = `
        <h3>Formation Analysis</h3>
        <div class="results-content">
          <div class="results-text">
            ${json.results.formatted_analysis}
          </div>
        </div>
      `;
      showAlert('Formation analysis completed successfully','success');
    } catch (err) {
      console.error('runFormationAnalysis error:', err);
      showAlert(`Error: ${err.message}`,'error');
    } finally {
      hideLoading();
    }
  }
  


// Display formation analysis results with real AI data
function displayFormationResults(results, fullAnalysis) {
    const formationResults = document.getElementById('formation-results');
    if (!formationResults) return;
    
    const resultsHtml = `
        <h3>Formation Analysis Results</h3>
        <div class="results-section">
            <div class="results-metrics">
                <div class="metric">
                    <div class="metric-value">${results.homeFormation}</div>
                    <div class="metric-label">Home Formation</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${results.awayFormation}</div>
                    <div class="metric-label">Away Formation</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${results.dominantTeam}</div>
                    <div class="metric-label">Dominant Team</div>
                </div>
            </div>
            <div class="results-visualization">
                <img src="${results.formationMapUrl}" alt="Formation Map">
            </div>
            <div class="results-insights">
                <h4>Key Insights</h4>
                <ul>
                    ${results.insights.map(insight => `<li>${insight}</li>`).join('')}
                </ul>
            </div>
            <div class="results-recommendations">
                <h4>Formation Recommendations</h4>
                <ul>
                    ${results.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
            <div class="full-analysis-toggle">
                <button class="btn btn-secondary" onclick="toggleFullAnalysis('formation-full-analysis')">
                    Show Full AI Analysis
                </button>
            </div>
            <div id="formation-full-analysis" class="full-analysis hidden">
                <h4>Complete AI Analysis</h4>
                <div class="full-analysis-content">
                    ${formatAnalysisText(fullAnalysis)}
                </div>
            </div>
        </div>
    `;
    
    formationResults.innerHTML = resultsHtml;
    
    // Add toggle functionality if not already defined
    if (!window.toggleFullAnalysis) {
        window.toggleFullAnalysis = function(id) {
            const element = document.getElementById(id);
            if (element) {
                element.classList.toggle('hidden');
                const button = element.previousElementSibling.querySelector('button');
                if (button) {
                    button.textContent = element.classList.contains('hidden') ? 
                        'Show Full AI Analysis' : 'Hide Full AI Analysis';
                }
            }
        };
    }
}

// Format analysis text for display
function formatAnalysisText(text) {
    if (!text) return '<p>No analysis available</p>';
    
    // Convert line breaks to paragraphs
    let formatted = text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    
    // Wrap in paragraph tags if not already
    if (!formatted.startsWith('<p>')) {
        formatted = '<p>' + formatted;
    }
    if (!formatted.endsWith('</p>')) {
        formatted = formatted + '</p>';
    }
    
    // Format headings
    formatted = formatted.replace(/<p>([A-Z][A-Z\s]+):<\/p>/g, '<h5>$1</h5>');
    
    // Format lists
    formatted = formatted.replace(/<br>(\d+\.\s+)/g, '</p><p>$1');
    formatted = formatted.replace(/<br>([•\-]\s+)/g, '</p><p class="list-item">$1');
    
    return formatted;
}

// Handle demo form submission
function handleDemoFormSubmission() {
    const demoForm = document.getElementById('demo-form');
    if (!demoForm) return;
    
    const name = demoForm.querySelector('#name').value;
    const email = demoForm.querySelector('#email').value;
    const team = demoForm.querySelector('#team').value;
    const interest = demoForm.querySelector('#interest').value;
    
    if (!name || !email) {
        showAlert('Please fill in all required fields', 'warning');
        return;
    }
    
    // Simulate form submission
    showLoading('Submitting your request...');
    
    setTimeout(() => {
        hideLoading();
        
        // Close the demo modal
        closeModal();
        
        // Show success modal
        const demoModal = document.getElementById('demo-modal');
        if (demoModal) {
            const modalContent = demoModal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.innerHTML = `
                    <span class="close-modal">&times;</span>
                    <div class="modal-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3>Thank You!</h3>
                    <p>Your demo request has been received. Our team will contact you shortly to schedule your personalized demo.</p>
                    <button class="btn btn-primary modal-close-btn">Close</button>
                `;
                
                // Add event listeners to close buttons
                const closeButtons = modalContent.querySelectorAll('.close-modal, .modal-close-btn');
                closeButtons.forEach(button => {
                    button.addEventListener('click', closeModal);
                });
                
                // Show the modal
                demoModal.classList.add('active');
            }
        }
        
        // Show success alert
        showAlert('Demo request submitted successfully!', 'success');
    }, 1500);
}

// Open demo modal
function openDemoModal() {
    const demoModal = document.getElementById('demo-modal');
    if (demoModal) {
        demoModal.classList.add('active');
    }
}

// Close modal
function closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.classList.remove('active');
    });
}

// Show loading overlay
function showLoading(message = 'Loading...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.querySelector('.loading-text');
    
    if (loadingOverlay && loadingText) {
        loadingText.textContent = message;
        loadingOverlay.classList.add('active');
    }
}

// Hide loading overlay
function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    
    if (loadingOverlay) {
        loadingOverlay.classList.remove('active');
    }
}

// Show alert
function showAlert(message, type = 'info') {
    const alertsContainer = document.getElementById('alerts-container');
    if (!alertsContainer) return;
    
    const alertId = 'alert-' + Date.now();
    
    const alertHtml = `
        <div id="${alertId}" class="alert ${type}">
            <div class="alert-icon">
                <i class="fas ${getAlertIcon(type)}"></i>
            </div>
            <div class="alert-content">
                <div class="alert-title">${capitalizeFirstLetter(type)}</div>
                <div class="alert-message">${message}</div>
            </div>
            <div class="alert-close">
                <i class="fas fa-times"></i>
            </div>
        </div>
    `;
    
    alertsContainer.insertAdjacentHTML('beforeend', alertHtml);
    
    const alertElement = document.getElementById(alertId);
    
    // Add event listener to close button
    const closeButton = alertElement.querySelector('.alert-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            alertElement.remove();
        });
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alertElement && alertElement.parentNode) {
            alertElement.remove();
        }
    }, 5000);
}

// Get alert icon based on type
function getAlertIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'error': return 'fa-times-circle';
        case 'info':
        default: return 'fa-info-circle';
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Capitalize first letter of a string
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function setupChatAssistantListeners() {
    const sendBtn   = document.querySelector('.chat-input .send-btn');
    const chatInput = document.getElementById('chat-input');
    if (!sendBtn || !chatInput) return;
  
    // on click
    sendBtn.addEventListener('click', sendChatMessage);
  
    // on Enter
    chatInput.addEventListener('keypress', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
  