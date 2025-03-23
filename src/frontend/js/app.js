// DOM Elements
const llmsForm = document.getElementById('llmsForm');
const resultContainer = document.getElementById('resultContainer');
const resultContent = document.getElementById('resultContent');
const copyBtn = document.getElementById('copyBtn');
const loader = document.getElementById('loader');
const notification = document.getElementById('notification');
const fullVersionCheckbox = document.getElementById('fullVersion');
const emailInput = document.getElementById('email');
const recaptchaModal = document.getElementById('recaptchaModal');
const closeModal = document.querySelector('.close-modal');
const submitRecaptchaBtn = document.getElementById('submitRecaptcha');

// Store form data while waiting for reCAPTCHA verification
let pendingFormData = null;

// API URL - adjust this based on your server configuration
const API_URL = '/api/generate';

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    llmsForm.addEventListener('submit', handleFormSubmit);
    copyBtn.addEventListener('click', copyToClipboard);
    fullVersionCheckbox.addEventListener('change', toggleEmailRequirement);
    
    // reCAPTCHA modal event listeners
    closeModal.addEventListener('click', closeRecaptchaModal);
    submitRecaptchaBtn.addEventListener('click', handleRecaptchaSubmit);
    
    // Check initial state of fullVersion checkbox
    if (fullVersionCheckbox.checked) {
        // Set the initial state of email requirement
        toggleEmailRequirement();
    }
    
    // Add smooth scrolling for all navigation links
    setupSmoothScrolling();
});

/**
 * Set up smooth scrolling for navigation links
 */
function setupSmoothScrolling() {
    // Get all links that have a hash (#) in their href
    const links = document.querySelectorAll('a[href^="#"]');
    
    // Add click event listener to each link
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            // Prevent default anchor behavior
            e.preventDefault();
            
            // Get the target element
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                // Smooth scroll to the target element
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                
                // Update URL hash without jumping (optional)
                history.pushState(null, null, targetId);
            }
        });
    });
}

/**
 * Toggle email field requirement based on fullVersion checkbox
 */
function toggleEmailRequirement() {
    const emailRequiredText = document.getElementById('emailRequiredText');
    
    if (fullVersionCheckbox.checked) {
        // Make email field required
        emailInput.setAttribute('required', '');
        emailRequiredText.style.color = 'var(--error-color)';
    } else {
        // Remove required attribute
        emailInput.removeAttribute('required');
        emailRequiredText.style.color = 'var(--text-secondary)';
    }
}

/**
 * Close the reCAPTCHA modal and reset
 */
function closeRecaptchaModal() {
    recaptchaModal.classList.remove('show');
    // Reset reCAPTCHA
    grecaptcha.reset();
    pendingFormData = null;
    
    // Reset loading state if we closed the modal
    if (resultContent.classList.contains('loading')) {
        resultContent.classList.remove('loading');
        resultContent.innerHTML = '<span class="result-placeholder">Your llms.txt will appear here</span>';
    }
}

/**
 * Handle the submission after reCAPTCHA verification
 */
async function handleRecaptchaSubmit() {
    // Get the reCAPTCHA response
    const recaptchaResponse = grecaptcha.getResponse();
    
    if (!recaptchaResponse) {
        showNotification('Please complete the reCAPTCHA verification.', 'error');
        return;
    }
    
    // Add the reCAPTCHA response to the form data
    if (pendingFormData) {
        pendingFormData.recaptchaToken = recaptchaResponse;
        
        // Hide the modal
        recaptchaModal.classList.remove('show');
        
        // Show loading state again
        resultContent.classList.add('loading');
        resultContent.innerHTML = `
            <div class="loading-container">
                <div class="loader" id="loader"></div>
                <span class="loading-text">Generating your llms.txt file...</span>
            </div>
        `;
        
        // Submit the form data with reCAPTCHA token
        await submitFormData(pendingFormData);
        
        // Reset for next use
        grecaptcha.reset();
        pendingFormData = null;
    }
}

/**
 * Handle form submission
 * @param {Event} e - Form submit event
 */
const handleFormSubmit = async (e) => {
    e.preventDefault();
    
    // Reset result content and remove any previous classes
    resultContent.classList.remove('error-content');
    resultContent.classList.remove('has-content');
    resultContent.classList.add('loading');
    
    // Update content to show loading state with spinner
    resultContent.innerHTML = `
        <div class="loading-container">
            <div class="loader" id="loader"></div>
            <span class="loading-text">Generating your llms.txt file...</span>
        </div>
    `;
    
    // Get form data
    const formData = new FormData(llmsForm);
    
    // Create data object
    const data = {
        companyName: formData.get('companyName'),
        companyDescription: formData.get('companyDescription'),
        websiteUrl: formData.get('websiteUrl'),
        fullVersion: fullVersionCheckbox.checked
    };
    
    // Add email if full version is selected
    if (data.fullVersion) {
        data.email = formData.get('email');
        
        // For full version, show reCAPTCHA
        pendingFormData = data;
        recaptchaModal.classList.add('show');
        
        // Remove loading state while waiting for reCAPTCHA
        resultContent.classList.remove('loading');
        resultContent.innerHTML = '<span class="result-placeholder">Please complete the verification first</span>';
        
        return; // Stop here and wait for reCAPTCHA
    }
    
    // For regular version, proceed normally
    await submitFormData(data);
};

/**
 * Submit form data to the API
 * @param {Object} data - Form data to submit
 */
async function submitFormData(data) {
    try {
        // Call API to generate LLMS.txt
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        // Check content type to handle different response formats
        const contentType = response.headers.get('content-type');
        
        let result;
        if (contentType && contentType.includes('application/json')) {
            // Process JSON response
            try {
                result = await response.json();
            } catch (parseError) {
                // If JSON parsing fails, get the raw text
                const errorText = await response.text();
                throw new Error(`Failed to parse response as JSON: ${errorText}`);
            }
        } else {
            // Handle non-JSON response (text, html, etc.)
            const textResponse = await response.text();
            
            // Try to create a structured error from the text
            result = {
                success: false,
                error: 'Response format error',
                message: textResponse || 'Server returned a non-JSON response'
            };
        }
        
        // Check if the response is an error
        if (!response.ok) {
            throw new Error(result.message || 'Failed to generate LLMS.txt', { cause: result });
        }
        
        if (data.fullVersion) {
            // For full version, show success message in notification
            showNotification(`Your comprehensive LLMS-full.txt file is being generated and will be sent to ${data.email} when ready.`, 'success');
            
            // Also update the result content area with a friendly message styled like the placeholder
            resultContent.innerHTML = `
                <div class="email-notification">
                    <h3>Request Received</h3>
                    <p>Your llms-full.txt file is being generated.<br>You'll receive an email once it's ready.</p>
                    <h3>${data.email}</h3>
                </div>
            `;
            resultContent.classList.add('has-content');
            resultContent.classList.add('email-notification-container');
            
            // Scroll to result container
            resultContainer.scrollIntoView({ behavior: 'smooth' });
        } else {
            // Make sure we have content data
            if (!result.data || !result.data.content) {
                // Handle missing content in the response
                throw new Error('Response missing expected content data', {
                    cause: { error: 'MissingContentError', message: 'The server response did not include the expected content.' }
                });
            }
            
            // For standard version, display the content
            resultContent.textContent = result.data.content;
            resultContent.classList.add('has-content');
            resultContent.classList.remove('email-notification-container');
            resultContent.classList.remove('loading');
            
            // Scroll to result container
            resultContainer.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Error during LLMS.txt generation:', error);
        
        // Extract error details from the response
        let errorMessage = error.message;
        let errorType = 'General Error';
        let suggestion = 'Please check your inputs and try again.';
        
        // Check if the error has a cause with additional error data
        if (error.cause) {
            const errorData = error.cause;
            
            if (errorData.error) {
                errorType = errorData.error;
            }
            
            if (errorData.message) {
                errorMessage = errorData.message;
            }
            
            // Add specific suggestions based on error type
            if (errorType === 'InvalidURL') {
                suggestion = 'Please provide a valid URL including http:// or https://';
            } else if (errorType === 'TimeoutError') {
                suggestion = 'The crawling process took too long. Try a smaller website or contact support.';
            }
        }
        
        // Remove loading state
        resultContent.classList.remove('loading');
        
        // Display error in the result container
        displayError(errorType, errorMessage, suggestion);
    }
}

/**
 * Copy result content to clipboard
 */
function copyToClipboard() {
    // Check if there's actual content (not just the placeholder)
    if (!resultContent.classList.contains('has-content')) {
        showNotification('No content to copy yet. Generate llms.txt first.', 'error');
        return;
    }
    
    const content = resultContent.textContent;
    
    // Use the Clipboard API
    navigator.clipboard.writeText(content)
        .then(() => {
            showNotification('LLMS.txt content copied to clipboard!', 'success');
        })
        .catch(err => {
            showNotification('Failed to copy content', 'error');
            console.error('Could not copy text: ', err);
        });
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success or error)
 */
function showNotification(message, type = 'success') {
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    // Hide notification after 5 seconds
    setTimeout(() => {
        notification.className = 'notification';
    }, 5000);
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether URL is valid
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Format markdown content for display
 * @param {string} markdown - Markdown content
 * @returns {string} - Formatted markdown
 */
function formatMarkdown(markdown) {
    // This is a simple formatter - for a real app, consider using a markdown library
    return markdown
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/\*\*(.*)\*\*/gm, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gm, '<em>$1</em>')
        .replace(/\[(.*?)\]\((.*?)\)/gm, '<a href="$2">$1</a>')
        .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
        .replace(/^- (.*$)/gm, '<li>$1</li>')
        .replace(/<\/li>\n<li>/g, '</li><li>')
        .replace(/<\/li>\n/g, '</li></ul>\n')
        .replace(/^<li>/gm, '<ul><li>');
}

// Add form validation
const inputs = llmsForm.querySelectorAll('input, textarea');
inputs.forEach(input => {
    input.addEventListener('blur', () => {
        if (input.hasAttribute('required') && !input.value.trim()) {
            input.classList.add('error');
        } else if (input.type === 'url' && input.value && !isValidUrl(input.value)) {
            input.classList.add('error');
        } else if (input.type === 'email' && input.value && !input.value.includes('@')) {
            input.classList.add('error');
        } else {
            input.classList.remove('error');
        }
    });
    
    input.addEventListener('input', () => {
        input.classList.remove('error');
    });
});

/**
 * Display error message in the result content
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error message
 * @param {string} suggestion - Suggestion for fixing the error
 */
function displayError(errorType, errorMessage, suggestion) {
    // Show error in notification
    showNotification(errorMessage, 'error');
    
    // Create appropriate error content based on error type
    let errorContent = '';
    let errorClass = '';
    
    if (errorType === 'Website Crawling Error') {
        errorClass = 'crawling-error';
        errorContent = `
            <div class="error-message-box ${errorClass}">
                <h3>⚠️ Website Crawling Error</h3>
                <p>${errorMessage}</p>
                <p>${suggestion}</p>
                <div class="error-tips">
                    <p><strong>Tips:</strong></p>
                    <ul>
                        <li>Check that the URL is correct and includes http:// or https://</li>
                        <li>Verify the website is publicly accessible</li>
                        <li>Try a different website if the issue persists</li>
                    </ul>
                </div>
                <button class="btn-primary retry-btn">Try Again</button>
            </div>
        `;
    } else if (errorType === 'Validation Error' || errorType === 'reCAPTCHA verification failed') {
        errorClass = 'validation-error';
        errorContent = `
            <div class="error-message-box ${errorClass}">
                <h3>⚠️ Validation Error</h3>
                <p>${errorMessage}</p>
                <p>Please check your form inputs and try again.</p>
                <button class="btn-primary retry-btn">Try Again</button>
            </div>
        `;
    } else if (errorType === 'Content Generation Error') {
        errorClass = 'generation-error';
        errorContent = `
            <div class="error-message-box ${errorClass}">
                <h3>⚠️ Content Generation Error</h3>
                <p>${errorMessage}</p>
                <p>${suggestion}</p>
                <button class="btn-primary retry-btn">Try Again</button>
            </div>
        `;
    } else {
        // Default error message
        errorContent = `
            <div class="error-message-box">
                <h3>⚠️ Error Generating LLMS.txt</h3>
                <p>${errorMessage}</p>
                <p>${suggestion}</p>
                <button class="btn-primary retry-btn">Try Again</button>
            </div>
        `;
    }
    
    resultContent.innerHTML = errorContent;
    resultContent.classList.add('error-content');
    
    // Add event listener to the retry button
    const retryBtn = resultContent.querySelector('.retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            // Clear the error state
            resultContent.classList.remove('error-content');
            // Focus on the form
            llmsForm.scrollIntoView({ behavior: 'smooth' });
        });
    }
    
    // Scroll to result container to show the error
    resultContainer.scrollIntoView({ behavior: 'smooth' });
} 