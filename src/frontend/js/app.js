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
    if (fullVersionCheckbox.checked) {
        emailInput.setAttribute('required', '');
        emailInput.parentElement.querySelector('label').innerHTML = 'Email* (required for comprehensive version)';
    } else {
        emailInput.removeAttribute('required');
        emailInput.parentElement.querySelector('label').innerHTML = 'Email (required for comprehensive version)';
    }
}

/**
 * Handle form submission
 * @param {Event} e - Form submit event
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    
    // Show loader
    loader.style.display = 'block';
    
    // Reset result content
    resultContent.innerHTML = '<span class="result-placeholder">Your llms.txt will appear here</span>';
    resultContent.classList.remove('has-content');
    
    // Get form data
    const formData = new FormData(llmsForm);
    const data = {
        companyName: formData.get('companyName'),
        companyDescription: formData.get('companyDescription'),
        websiteUrl: formData.get('websiteUrl'),
        email: formData.get('email'),
        fullVersion: formData.get('fullVersion') === 'on'
    };
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Failed to generate LLMS.txt');
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
        showNotification(error.message, 'error');
    } finally {
        // Hide loader
        loader.style.display = 'none';
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