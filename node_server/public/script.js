document.getElementById('add-block-btn').addEventListener('click', function() {
    const dynamicBlocksContainer = document.getElementById('dynamic-blocks-container');

    // Create a new block for additional information
    const newBlock = document.createElement('div');
    newBlock.classList.add('dynamic-block');

    // Create a new textarea for additional info
    const newTextarea = document.createElement('textarea');
    newTextarea.classList.add('dynamic-info');
    newTextarea.setAttribute('name', 'additional-info');
    newTextarea.setAttribute('placeholder', 'Enter any additional details here');
    
    // Append the new textarea to the new block
    newBlock.appendChild(newTextarea);
    
    // Append the new block to the dynamic blocks container
    dynamicBlocksContainer.appendChild(newBlock);
});

// Handle form submission
document.getElementById('info-form').addEventListener('submit', function (event) {
    event.preventDefault();

    // Get form data
    const formData = new FormData();

    formData.append('github-link', document.getElementById('github-link').value);
    formData.append('twitter-link', document.getElementById('twitter-link').value);
    formData.append('other-link', document.getElementById('other-link').value);

    // Collect all dynamic information textareas
    const additionalInfoElements = document.querySelectorAll('.dynamic-info');
    additionalInfoElements.forEach((textarea, index) => {
        formData.append(`additional-info-${index}`, textarea.value);
    });

    // Now, send this data to your server
    fetch('/submit-info', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        alert('Information submitted successfully!');
        // Handle the response, like redirecting or clearing the form
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
    });
});
