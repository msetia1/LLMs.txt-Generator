// DOM Elements
const llmsForm = document.getElementById('llmsForm');
const resultContainer = document.getElementById('resultContainer');
const resultContent = document.getElementById('resultContent');
const copyBtn = document.getElementById('copyBtn');
const loader = document.getElementById('loader');
const notification = document.getElementById('notification');
const fullVersionCheckbox = document.getElementById('fullVersion');
const emailInput = document.getElementById('email');

// API URL - adjust this based on your server configuration
const API_URL = '/api/generate';

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    llmsForm.addEventListener('submit', handleFormSubmit);
    copyBtn.addEventListener('click', copyToClipboard);
    fullVersionCheckbox.addEventListener('change', toggleEmailRequirement);
    
    // Check initial state of fullVersion checkbox
    if (fullVersionCheckbox.checked) {
        resultContent.classList.add('expanded');
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
    const emailField = document.querySelector('.email-field');
    
    if (fullVersionCheckbox.checked) {
        // Show email field and make it required
        emailField.classList.remove('hidden');
        emailInput.setAttribute('required', '');
        // Expand the result content area to match
        resultContent.classList.add('expanded');
    } else {
        // Hide email field and remove required attribute
        emailField.classList.add('hidden');
        emailInput.removeAttribute('required');
        // Clear the email value when hiding
        emailInput.value = '';
        // Return result content to normal size
        resultContent.classList.remove('expanded');
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
    
    // Maintain expanded state if fullVersion is checked
    if (fullVersionCheckbox.checked) {
        resultContent.classList.add('expanded');
    } else {
        resultContent.classList.remove('expanded');
    }
    
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
    }
    
    try {
        // Call API to generate LLMS.txt
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        // Get the response data
        const result = await response.json();
        
        // Check if the response is an error
        if (!response.ok) {
            throw new Error(result.message || 'Failed to generate LLMS.txt', { cause: result });
        }
        
        if (data.fullVersion) {
            // For full version, show success message
            showNotification(`Your comprehensive LLMS-full.txt file is being generated and will be sent to ${data.email} when ready.`, 'success');
        } else {
            // For standard version, display the content
            resultContent.textContent = result.data.content;
            resultContent.classList.add('has-content');
            
            // Scroll to result container
            resultContainer.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        // Extract error details from the response
        let errorMessage = error.message;
        let errorType = 'General Error';
        let suggestion = 'Please check your inputs and try again.';
        
        // Check if the error has a cause with additional error data
        if (error.cause) {
            const errorData = error.cause;
            errorMessage = errorData.message || errorMessage;
            errorType = errorData.error || errorType;
            suggestion = errorData.suggestion || suggestion;
        }
        
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
        } else if (errorType === 'Validation Error') {
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
                handleFormSubmit(e);
            });
        }
        
        // Scroll to result container to show the error
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    } finally {
        // Remove loading state
        resultContent.classList.remove('loading');
        // We no longer need to hide the loader manually as it's part of the content that gets replaced
    }
};

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