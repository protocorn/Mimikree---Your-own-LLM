// Cookie consent functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check if user has already consented
    const hasConsented = localStorage.getItem('cookieConsent');
    
    if (!hasConsented) {
        // Create cookie consent banner
        const cookieBanner = document.createElement('div');
        cookieBanner.id = 'cookie-consent-banner';
        cookieBanner.innerHTML = `
            <div class="cookie-content">
                <p>We use cookies to improve your experience and analyze site usage. 
                By continuing to use our site, you consent to our use of cookies. 
                <a href="/privacy-policy">Learn more</a></p>
                <div class="cookie-buttons">
                    <button id="cookie-accept">Accept All</button>
                    <button id="cookie-customize">Customize</button>
                    <button id="cookie-reject">Reject Non-Essential</button>
                </div>
            </div>
        `;
        
        // Add styling
        cookieBanner.style.position = 'fixed';
        cookieBanner.style.bottom = '0';
        cookieBanner.style.left = '0';
        cookieBanner.style.right = '0';
        cookieBanner.style.background = '#f8f8f8';
        cookieBanner.style.padding = '15px';
        cookieBanner.style.boxShadow = '0 -2px 10px rgba(0,0,0,0.1)';
        cookieBanner.style.zIndex = '10000';
        cookieBanner.style.borderTop = '1px solid #ddd';
        
        // Add to page
        document.body.appendChild(cookieBanner);
        
        // Add button styling
        const buttons = cookieBanner.querySelectorAll('button');
        buttons.forEach(button => {
            button.style.padding = '8px 16px';
            button.style.margin = '5px';
            button.style.border = 'none';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
        });
        
        // Add specific button styles
        document.getElementById('cookie-accept').style.backgroundColor = '#4CAF50';
        document.getElementById('cookie-accept').style.color = 'white';
        document.getElementById('cookie-customize').style.backgroundColor = '#2196F3';
        document.getElementById('cookie-customize').style.color = 'white';
        document.getElementById('cookie-reject').style.backgroundColor = '#f1f1f1';
        document.getElementById('cookie-reject').style.color = '#333';
        
        // Content styling
        const cookieContent = cookieBanner.querySelector('.cookie-content');
        cookieContent.style.maxWidth = '1200px';
        cookieContent.style.margin = '0 auto';
        cookieContent.style.display = 'flex';
        cookieContent.style.flexWrap = 'wrap';
        cookieContent.style.alignItems = 'center';
        cookieContent.style.justifyContent = 'space-between';
        
        // Event listeners
        document.getElementById('cookie-accept').addEventListener('click', function() {
            setCookieConsent('all');
            hideBanner();
        });
        
        document.getElementById('cookie-customize').addEventListener('click', function() {
            showCookieModal();
        });
        
        document.getElementById('cookie-reject').addEventListener('click', function() {
            setCookieConsent('essential');
            hideBanner();
        });
    }
    
    // Set cookie consent preferences
    function setCookieConsent(level) {
        const consentData = {
            level: level,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('cookieConsent', JSON.stringify(consentData));
    }
    
    // Hide the banner
    function hideBanner() {
        const banner = document.getElementById('cookie-consent-banner');
        if (banner) {
            banner.style.display = 'none';
        }
    }
    
    // Show cookie customization modal
    function showCookieModal() {
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'cookie-modal';
        modal.innerHTML = `
            <div class="cookie-modal-content">
                <span class="close-modal">&times;</span>
                <h2>Cookie Preferences</h2>
                
                <div class="cookie-option">
                    <input type="checkbox" id="essential-cookies" checked disabled>
                    <label for="essential-cookies">
                        <strong>Essential Cookies</strong> - Required for the website to function properly
                    </label>
                </div>
                
                <div class="cookie-option">
                    <input type="checkbox" id="analytics-cookies">
                    <label for="analytics-cookies">
                        <strong>Analytics Cookies</strong> - Help us improve our website by collecting anonymous usage data
                    </label>
                </div>
                
                <div class="cookie-option">
                    <input type="checkbox" id="preference-cookies">
                    <label for="preference-cookies">
                        <strong>Preference Cookies</strong> - Allow the website to remember your preferences and settings
                    </label>
                </div>
                
                <div class="cookie-option">
                    <input type="checkbox" id="marketing-cookies">
                    <label for="marketing-cookies">
                        <strong>Marketing Cookies</strong> - Used to track visitors across websites to display relevant ads
                    </label>
                </div>
                
                <button id="save-preferences">Save Preferences</button>
            </div>
        `;
        
        // Style modal
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.4)';
        modal.style.zIndex = '10001';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        
        // Style modal content
        const modalContent = modal.querySelector('.cookie-modal-content');
        modalContent.style.backgroundColor = '#fefefe';
        modalContent.style.padding = '20px';
        modalContent.style.border = '1px solid #888';
        modalContent.style.width = '80%';
        modalContent.style.maxWidth = '600px';
        modalContent.style.borderRadius = '5px';
        modalContent.style.position = 'relative';
        
        // Style close button
        const closeBtn = modal.querySelector('.close-modal');
        closeBtn.style.color = '#aaa';
        closeBtn.style.float = 'right';
        closeBtn.style.fontSize = '28px';
        closeBtn.style.fontWeight = 'bold';
        closeBtn.style.cursor = 'pointer';
        
        // Style cookie options
        const cookieOptions = modal.querySelectorAll('.cookie-option');
        cookieOptions.forEach(option => {
            option.style.margin = '15px 0';
        });
        
        // Style save button
        const saveBtn = document.getElementById('save-preferences');
        saveBtn.style.backgroundColor = '#4CAF50';
        saveBtn.style.color = 'white';
        saveBtn.style.padding = '10px 15px';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '4px';
        saveBtn.style.cursor = 'pointer';
        saveBtn.style.marginTop = '15px';
        saveBtn.style.display = 'block';
        
        // Add to page
        document.body.appendChild(modal);
        
        // Event listeners
        closeBtn.addEventListener('click', function() {
            closeModal();
        });
        
        window.addEventListener('click', function(event) {
            if (event.target == modal) {
                closeModal();
            }
        });
        
        document.getElementById('save-preferences').addEventListener('click', function() {
            // Get user preferences
            const preferences = {
                essential: true, // Always on
                analytics: document.getElementById('analytics-cookies').checked,
                preferences: document.getElementById('preference-cookies').checked,
                marketing: document.getElementById('marketing-cookies').checked
            };
            
            // Save preferences
            setCookiePreferences(preferences);
            closeModal();
            hideBanner();
        });
        
        // Close modal function
        function closeModal() {
            document.getElementById('cookie-modal').remove();
        }
        
        // Set detailed cookie preferences
        function setCookiePreferences(preferences) {
            const consentData = {
                level: 'custom',
                preferences: preferences,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('cookieConsent', JSON.stringify(consentData));
        }
    }
}); 