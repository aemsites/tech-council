import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Fetch recordings data from a spreadsheet
 * @param {string} path Path to the JSON endpoint (e.g., '/recordings-data.json')
 * @returns {Promise<Array>} Array of recording objects
 */
async function fetchRecordingsData(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    const json = await response.json();
    return json.data || [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching recordings data:', error);
    return [];
  }
}

/**
 * Create a recording card from data
 * @param {Object} recording Recording data object
 * @param {number} index Index for animation staggering
 * @returns {HTMLElement} List item element
 */
function createRecordingCard(recording, index) {
  const li = document.createElement('li');
  li.style.setProperty('--i', String(index));
  
  // Create image container
  const imageDiv = document.createElement('div');
  imageDiv.className = 'recordings-card-image';
  imageDiv.setAttribute('data-valign', 'middle');
  
  if (recording.Image) {
    const picture = createOptimizedPicture(recording.Image, recording.Title || '', false, [{ width: '750' }]);
    imageDiv.appendChild(picture);
  }
  
  // Create body container
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'recordings-card-body';
  bodyDiv.setAttribute('data-valign', 'middle');
  
  // Title
  if (recording.Title) {
    const titleP = document.createElement('p');
    const titleStrong = document.createElement('strong');
    titleStrong.textContent = recording.Title;
    titleP.appendChild(titleStrong);
    bodyDiv.appendChild(titleP);
  }
  
  // Authors
  if (recording.Authors) {
    const authorsP = document.createElement('p');
    authorsP.innerHTML = `By <em><strong>${recording.Authors}</strong></em>`;
    bodyDiv.appendChild(authorsP);
  }
  
  // Video Link
  if (recording['Video Link']) {
    const videoP = document.createElement('p');
    videoP.className = 'button-container';
    const videoLink = document.createElement('a');
    videoLink.href = recording['Video Link'];
    videoLink.title = 'Watch Now';
    videoLink.className = 'button';
    videoLink.textContent = 'Watch Now';
    videoLink.setAttribute('target', '_blank');
    videoLink.setAttribute('rel', 'noopener');
    videoP.appendChild(videoLink);
    bodyDiv.appendChild(videoP);
  }
  
  // Presentation Link
  if (recording['Presentation Link']) {
    const presP = document.createElement('p');
    presP.className = 'button-container';
    const presLink = document.createElement('a');
    presLink.href = recording['Presentation Link'];
    presLink.title = 'View Presentation';
    presLink.className = 'button';
    presLink.textContent = 'View Presentation';
    presLink.setAttribute('target', '_blank');
    presLink.setAttribute('rel', 'noopener');
    presP.appendChild(presLink);
    bodyDiv.appendChild(presP);
  }
  
  li.appendChild(imageDiv);
  li.appendChild(bodyDiv);
  
  return li;
}

/**
 * Decorate recordings block - supports both inline content and external data
 * Authoring expects two columns per row: Image | Text
 * Or can fetch from external JSON endpoint
 */
export default async function decorate(block) {
  const ul = document.createElement('ul');
  
  // Check if block has a data source specified
  const dataSource = block.querySelector('a[href*=".json"]')?.href;
  
  if (dataSource) {
    // Fetch data from external source
    const recordings = await fetchRecordingsData(dataSource);
    
    // Create cards from data (reverse to show latest first)
    recordings.reverse().forEach((recording, index) => {
      const li = createRecordingCard(recording, index);
      ul.appendChild(li);
    });
  } else {
    // Use inline content (existing behavior)
    const rows = [...block.children].reverse();
    rows.forEach((row, rowIdx) => {
      const li = document.createElement('li');
      while (row.firstElementChild) li.append(row.firstElementChild);

      [...li.children].forEach((div) => {
        if (div.children.length === 1 && div.querySelector('picture')) {
          div.className = 'recordings-card-image';
        } else {
          div.className = 'recordings-card-body';
        }
      });

      // expose index for CSS animation staggering
      li.style.setProperty('--i', String(rowIdx));
      ul.append(li);
    });
    
    // optimise pictures
    ul.querySelectorAll('picture > img').forEach((img) => {
      const pic = img.closest('picture');
      pic.replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]));
    });
  }

  // Make all links open in new tab
  ul.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });

  block.textContent = '';
  block.append(ul);
} 